import { main as piMain } from "@earendil-works/pi-coding-agent";
import brandingFactory from "./branding.ts";

type PiMain = typeof piMain;

export async function runSciPi(args: string[], runner: PiMain = piMain): Promise<void> {
  await runner(args, { extensionFactories: [brandingFactory] });
}

if (import.meta.main) {
  await runSciPi(process.argv.slice(2));
}
