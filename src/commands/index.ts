import type { SlashCommand } from '../interactions/types.js';
import { adminCommand } from './organizer/admin.js';
import { announceCommand } from './organizer/announce.js';
import { faqCommand } from './participant/faq.js';
import { helpCommand } from './participant/help.js';
import { nextCommand } from './participant/next.js';
import { profileCommand } from './participant/profile.js';
import { resourcesCommand } from './participant/resources.js';
import { rulesCommand } from './participant/rules.js';
import { scheduleCommand } from './participant/schedule.js';
import { verifyCommand } from './participant/verify.js';
import { workshopsCommand } from './participant/workshops.js';

export const commands: readonly SlashCommand[] = [
  helpCommand,
  rulesCommand,
  faqCommand,
  resourcesCommand,
  scheduleCommand,
  nextCommand,
  verifyCommand,
  profileCommand,
  workshopsCommand,
  announceCommand,
  adminCommand,
];
