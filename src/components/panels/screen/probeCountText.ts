import { CONTENT, fill } from '@/content';

/** A count of probes as the roster, and the company screen read it: "4 probes", "1 probe". */
export function probeCountText(n: number): string {
  return n === 1 ? CONTENT['probe.roster.count.one'].human : fill('probe.roster.count', { n: String(n) });
}
