/**
 * The old address of one Ri action, served by /api/home/actions/[name].
 * Before Ri's tools moved to /api/home/, they lived here. Other agents'
 * settings, OAuth sign-ins, sessions started before an update and devices
 * on an older release still call this address (src/lib/coordinator/legacy-names.ts).
 */
export const runtime = 'nodejs';
export { POST } from '@/app/api/home/actions/[name]/route';
