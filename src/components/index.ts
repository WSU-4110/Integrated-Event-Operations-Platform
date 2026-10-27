import type { ComponentHandler } from '../interactions/types.js';
import { helpButtons } from './buttons/helpButtons.js';
import { scheduleButtons } from './buttons/scheduleButtons.js';
import { workshopButtons } from './buttons/workshopButtons.js';
import { announceHandler } from './modals/announceModal.js';
import { verifyHandler } from './modals/verifyModal.js';
import { faqSelect } from './selectMenus/faqSelect.js';
import { resourceSelect } from './selectMenus/resourceSelect.js';

export const componentHandlers: readonly ComponentHandler[] = [
  helpButtons,
  faqSelect,
  resourceSelect,
  verifyHandler,
  workshopButtons,
  scheduleButtons,
  announceHandler,
];
