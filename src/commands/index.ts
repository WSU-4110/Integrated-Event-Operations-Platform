import type { SlashCommand } from '../interactions/types.js';
import { adminCommand } from './organizer/admin.js';
import { faqCommand } from './participant/faq.js';
import { helpCommand } from './participant/help.js';
import { profileCommand } from './participant/profile.js';
import { resourcesCommand } from './participant/resources.js';
import { rulesCommand } from './participant/rules.js';
import { verifyCommand } from './participant/verify.js';

export const commands: readonly SlashCommand[] = [
  helpCommand,
  rulesCommand,
  faqCommand,
  resourcesCommand,
  verifyCommand,
  profileCommand,
  adminCommand,
];
