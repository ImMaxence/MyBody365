import type { frAdminFoods, frAdminModeration } from './fr-admin';
import type { Widen } from './widen';

/** Admin screens added after 0.3: the food data (Ciqual) and the moderation of what members share. */
export const enAdminFoods: Widen<typeof frAdminFoods> = {
  ciqual: 'Ciqual table (ANSES)',
  ciqualText: 'Everyday foods come from the Ciqual table of ANSES. The update fetches the latest version published, adds it and keeps the older ones: meals already logged do not change',
  version: 'Version in use',
  versionNone: 'No table imported',
  foods: '{n} foods',
  superseded: '{n} foods from older versions kept',
  off: '{n} Open Food Facts products cached',
  user: '{n} foods created by members',
  update: 'Update Ciqual',
  started: 'Update started',
  history: 'Update history',
  steps: {
    dataset: 'Looking for the latest version',
    foods: 'Downloading the foods',
    groups: 'Downloading the categories',
    compo: 'Downloading the composition',
    parse: 'Reading the files',
    save: 'Saving',
  },
  status: { RUNNING: 'Running', DONE: 'Done', UP_TO_DATE: 'Already up to date', FAILED: 'Failed' },
  done: 'Ciqual {version}: {n} foods added',
  upToDate: 'Ciqual is already up to date ({version})',
  failed: 'The update failed: {message}',
  by: 'by {name}',
  none: 'No update yet',
  source: 'Source: Ciqual, ANSES, Etalab Open Licence 2.0',
};

export const enAdminModeration: Widen<typeof frAdminModeration> = {
  intro: 'Members can report a community recipe or a photo shared with them. A photo only shows here once it has been reported',
  reports: 'Reports to handle',
  none: 'No pending report',
  recipe: 'Recipe',
  photo: 'Shared photo',
  reportedBy: 'Reported by {name} · {date}',
  reasons: { INAPPROPRIATE: 'Shocking content', ILLEGAL: 'Illegal content', SPAM: 'Advertising or spam', OTHER: 'Other' },
  owner: 'Posted by {name}',
  dismiss: 'Nothing wrong',
  hide: 'Hide from the community',
  deletePhoto: 'Delete the photo',
  suspend: 'Suspend the account',
  handled: 'Report handled',
  sharedRecipes: 'Shared recipes',
  hidden: 'Hidden',
  restore: 'Put back online',
  hideRecipe: 'Hide',
  recipeHidden: 'Recipe hidden',
  recipeRestored: 'Recipe back online',
};
