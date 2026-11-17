-- OpenCode's effort levels were kept as model variants. agentex 0.0.51 reports
-- them as the model's efforts and sends effort as the variant, so they move to
-- effort, where every other provider keeps it. A variant that isn't an effort
-- level stays a variant.
UPDATE `chat_sessions`
SET `effort` = `model_variant`, `model_variant` = NULL
WHERE `harness` = 'opencode'
  AND `model_variant` IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max');--> statement-breakpoint
UPDATE `harness_settings`
SET `default_effort` = `default_variant`, `default_variant` = NULL
WHERE `harness` = 'opencode'
  AND `default_variant` IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max');--> statement-breakpoint
UPDATE `user_state`
SET `default_effort` = `default_variant`, `default_variant` = NULL
WHERE `default_harness` = 'opencode'
  AND `default_variant` IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max');--> statement-breakpoint
UPDATE `workspaces`
SET `review_defaults` = json_set(`review_defaults`, '$.effort', json_extract(`review_defaults`, '$.variant'), '$.variant', json('null'))
WHERE json_valid(`review_defaults`)
  AND json_extract(`review_defaults`, '$.harness') = 'opencode'
  AND json_extract(`review_defaults`, '$.variant') IN ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max');
