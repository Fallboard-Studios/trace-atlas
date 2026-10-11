import { CONTENT, fill } from '@/content';

/** A count of probes as the roster, the company screen and the meta box read it: "4 probes", "1 probe". */
export function probeCountText(n: number): string {
  return n === 1 ? CONTENT['probe.roster.count.one'].human : fill('probe.roster.count', { n: String(n) });
}
