/**
 * The old address of the results MCP, served by /api/home/results/[transport].
 * Before Ri's tools moved to /api/home/, they lived here. Other agents'
 * settings, OAuth sign-ins, sessions started before an update and devices
 * on an older release still call this address (src/lib/coordinator/legacy-names.ts).
 */
export { GET, POST, DELETE } from '@/app/api/home/results/[transport]/route';
