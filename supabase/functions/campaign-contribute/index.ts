import { handleContribution } from '../_shared/contribute.ts';
import { contributionDeps } from '../_shared/runtime.ts';

Deno.serve((req) => handleContribution(req, contributionDeps()));
