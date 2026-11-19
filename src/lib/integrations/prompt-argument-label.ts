/**
 * What a prompt argument is called in its form and in what Ri says about it: its title, else its
 * name in words ("sourceAccount" is "Source account", "person" is "Person").
 */
export function promptArgumentLabel(arg: { name: string; title?: string }): string {
  if (arg.title) return arg.title;
  const words = arg.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : arg.name;
}
