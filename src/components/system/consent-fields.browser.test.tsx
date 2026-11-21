/** The real server-built consent form, with no React hydration. */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { browserFixture } from "@/test/fixtures/browser-fixture";
import type { AuthorizeRequest } from "@/lib/oauth/flow";

vi.mock("@/lib/integrations/hub/consent", () => ({
  hubConsentFor: async () => ({
    accounts: [
      {
        connectionId: "account",
        toolkitId: "mail",
        service: "Mail",
        account: "demo@example.test",
        tools: [
          { name: "read_mail", description: "Read mail", requested: true },
          {
            name: "send_mail",
            description: "Send mail",
            requested: false,
            asks: true,
          },
        ],
      },
    ],
    services: [{ name: "tasks", description: "Read tasks", requested: true }],
  }),
}));
vi.mock("@/lib/oauth/issuer", () => ({
  OAUTH_PATHS: { decide: "/api/oauth/authorize" },
}));
vi.mock("@/lib/oauth/consent", () => ({
  consentCopy: () => ({ origin: "From example.test" }),
  consentFields: () => [
    ["client_id", "sample-client"],
    ["state", "sample-state"],
  ],
}));
import { OAUTH_PATHS } from "@/lib/oauth/issuer";
import { HubConsent } from "@/app/oauth/authorize/hub-consent";

let fixture: Awaited<ReturnType<typeof browserFixture>>;
let html: string;
beforeAll(async () => {
  const request = {
    client: {
      id: "sample-client",
      name: "Sample app",
      clientUri: "https://example.test",
    },
    audience: "hub",
    scope: null,
  } as AuthorizeRequest;
  html = renderToStaticMarkup(
    await HubConsent({
      request,
      params: new URLSearchParams(),
      issuer: "https://ri.example.test",
    }),
  );
  fixture = await browserFixture("", [], { css: true });
}, 120_000);
afterAll(async () => {
  await fixture?.close();
});
for (const theme of ["light", "dark"])
  it(`keeps native consent controls and submission before hydration (${theme})`, async () => {
    const page = await fixture.browser.newPage({
      viewport: { width: 900, height: 1100 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(fixture.url);
      await page.setContent(
        `<!doctype html><html class="${theme === "dark" ? "dark" : ""}"><head><link rel="stylesheet" href="${fixture.url}/style.css"></head><body style="padding:24px;background:var(--pane);color:var(--t1)">${html}</body></html>`,
      );
      const read = page.getByRole("checkbox", { name: /read_mail/ });
      await read.waitFor();
      expect(await read.isChecked()).toBe(true);
      await page.getByText("send_mail", { exact: true }).click();
      await read.uncheck();
      const service = page.getByRole("checkbox", {
        name: "Read tasks",
        exact: true,
      });
      expect(await service.isChecked()).toBe(true);
      await page.keyboard.press("Tab");
      await service.focus();
      expect(
        await service.evaluate((el) => getComputedStyle(el).outlineWidth),
      ).toBe("2px");
      expect(
        await service.evaluate((el) => {
          const probe = document.createElement("i");
          probe.style.color = "var(--primary)";
          document.body.append(probe);
          const same =
            getComputedStyle(el).accentColor === getComputedStyle(probe).color;
          probe.remove();
          return same;
        }),
      ).toBe(true);
      expect(
        await page
          .getByRole("button", { name: "Allow", exact: true })
          .isDisabled(),
      ).toBe(true);
      const posted = page.waitForRequest(
        (req) =>
          req.method() === "POST" &&
          new URL(req.url()).pathname === OAUTH_PATHS.decide,
      );
      await page.route("**" + OAUTH_PATHS.decide, (route) =>
        route.fulfill({ status: 200, body: "Saved" }),
      );
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      const request = await posted;
      expect([...new URLSearchParams(request.postData() ?? "")]).toEqual([
        ["client_id", "sample-client"],
        ["state", "sample-state"],
        ["tool:account", "send_mail"],
        ["service", "tasks"],
        ["decision", "deny"],
      ]);
    } finally {
      await page.close();
    }
  });
