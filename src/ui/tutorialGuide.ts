import { CROPS } from '../game/content/crops';
import { claimableTierLevel, type FarmState } from '../game/simulation/farmGame';
import { milestoneCropId, seedBuyTargetAvailable, seedRestockNeeded } from './farmPanelRows';
import { storagePressureInfo } from './panelState';
import type { IconName } from './pixelIcons';

export type TutorialTip = {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  action: string;
  why: string;
  targetSelector: string;
};

export interface TutorialContext {
  activePanel: 'inventory' | 'requests' | 'goals' | 'mix' | 'inspect';
  selectedTool: 'inspect' | 'plot' | 'well' | 'storage' | 'land' | 'bulldoze';
  isSeen(id: string): boolean;
}

export function selectTutorialTip(state: FarmState, context: TutorialContext): TutorialTip | null {
  const claimable = claimableTierLevel(state);
  if (claimable) {
    if (context.activePanel === 'goals' && !context.isSeen('claim-tier')) {
      return {
        id: 'claim-tier',
        icon: 'claim',
        title: `Claim Tier ${claimable}`,
        body: 'Milestones make rewards ready, but you choose when to unlock them.',
        action: 'Click Claim Rewards in Goals.',
        why: 'Claiming adds the next crop, worker, and planning options without changing your layout.',
        targetSelector: '[data-command="claim-tier"]',
      };
    }
    if (context.activePanel !== 'goals' && !context.isSeen('open-goals-for-claim')) {
      return {
        id: 'open-goals-for-claim',
        icon: 'flag',
        title: 'Open Goals',
        body: `Tier ${claimable} is ready. Open Goals to claim the reward.`,
        action: 'Click the Goals tab on the right panel.',
        why: 'Tier rewards live in Goals so you can review the unlock before accepting it.',
        targetSelector: '[data-panel="goals"]',
      };
    }
  }

  const alerts = state.alerts.join(' ');
  const needsSeedRestock = seedRestockNeeded(state);
  if (needsSeedRestock) {
    const goalCrop = milestoneCropId(state);
    const buyableGoalCrop = goalCrop && seedBuyTargetAvailable(state, goalCrop) ? goalCrop : null;
    const goalSeedAction = buyableGoalCrop
      ? `Buy the ${CROPS[buyableGoalCrop].label} goal seed button first.`
      : null;
    if ((context.activePanel === 'inventory' || context.activePanel === 'goals') && !context.isSeen('buy-needed-seeds')) {
      return {
        id: 'buy-needed-seeds',
        icon: 'seed',
        title: 'Buy Seeds',
        body: 'Farmers plant seeds automatically once empty plots are available.',
        action: goalSeedAction
          ? goalSeedAction
          : 'Buy a seed packet for any desired crop with zero seeds.',
        why: 'Workers cannot plant without seeds, even when plots and water are ready.',
        targetSelector: context.activePanel === 'inventory'
          ? (buyableGoalCrop ? `[data-buy-seeds="${buyableGoalCrop}"]:not([disabled])` : '[data-buy-seeds]:not([disabled])')
          : '[data-seed-guidance-action]',
      };
    }
    if (context.activePanel !== 'inventory' && context.activePanel !== 'goals' && !context.isSeen('open-goals-for-seeds')) {
      return {
        id: 'open-goals-for-seeds',
        icon: 'flag',
        title: 'Open Goals',
        body: 'The farm needs seeds. Goals will show the direct restock button.',
        action: 'Click Goals, then use a seed restock button.',
        why: 'Goals highlights the exact crop that is blocking your workers.',
        targetSelector: '[data-panel="goals"]',
      };
    }
  }

  if (alerts.includes('Paint plots')) {
    if (context.selectedTool !== 'plot' && !context.isSeen('select-plot-tool')) {
      return {
        id: 'select-plot-tool',
        icon: 'plot',
        title: 'Select Plot',
        body: 'You have seeds, but no empty plots. Select Plot first.',
        action: 'Press 1 or click Plot in the toolbar.',
        why: 'Workers need empty plot tiles before they can carry seeds and plant crops.',
        targetSelector: '[data-tool="plot"]',
      };
    }
    if (context.selectedTool === 'plot' && !context.isSeen('paint-empty-land')) {
      return {
        id: 'paint-empty-land',
        icon: 'plot',
        title: 'Paint Empty Land',
        body: 'Click an empty green tile. Farmers will bring carrot seeds there.',
        action: 'Click a green owned tile that does not already contain a building or plot.',
        why: 'Painted plots become the planting targets workers use for the next crop cycle.',
        targetSelector: '#game-canvas',
      };
    }
  }

  const hasSellableCrops = Object.values(state.inventory.crops).some((count) => count > 0);
  const storagePressure = storagePressureInfo(state);
  if (hasSellableCrops) {
    if (context.activePanel === 'inventory' && !context.isSeen('sell-first-crop')) {
      return {
        id: 'sell-first-crop',
        icon: 'coins',
        title: 'Sell Crops',
        body: 'Turn stored crops into coins when you want more seeds or upgrades.',
        action: 'Click Sell All or a crop-specific sell button.',
        why: 'Coins buy seeds, land, storage, wells, and worker upgrades.',
        targetSelector: '[data-sell], [data-command="sell-all"]',
      };
    }
    if (context.activePanel !== 'inventory' && (storagePressure || !context.isSeen('open-inventory-for-selling'))) {
      return {
        id: 'open-inventory-for-selling',
        icon: 'backpack',
        title: 'Open Inventory',
        body: storagePressure
          ? `Storage is almost full (${storagePressure.stored}/${storagePressure.capacity}). Sell crops to make room.`
          : 'You have crops ready to sell.',
        action: storagePressure
          ? 'Click Inventory, then Sell All or a crop-specific sell button.'
          : 'Click Inventory to see crop counts and sell controls.',
        why: storagePressure
          ? 'Selling stored crops frees bin space and turns a full harvest into spendable coins.'
          : 'Selling harvested crops converts stored goods into spendable coins.',
        targetSelector: '[data-panel="inventory"]',
      };
    }
  }

  if (needsSeedRestock || storagePressure) {
    return null;
  }

  if (state.tier.level >= 2 && state.community.completedCount === 0 && !state.community.activeRequestId) {
    if (context.activePanel !== 'requests' && !context.isSeen('open-request-board')) {
      return {
        id: 'open-request-board',
        icon: 'basket',
        title: 'Meet The Village',
        body: 'Village Requests trade a planned crop basket for more coins than ordinary selling.',
        action: 'Open Village Requests on the right panel.',
        why: 'A pinned basket gives your crop mix a short-term purpose, with no timer or penalty.',
        targetSelector: '[data-panel="requests"]',
      };
    }
    if (context.activePanel === 'requests' && !context.isSeen('accept-first-request')) {
      return {
        id: 'accept-first-request',
        icon: 'basket',
        title: 'Pin A Neighbor Basket',
        body: 'Compare the two notes and choose the crops you want to hold for a premium.',
        action: 'Pin one basket from the board.',
        why: 'Your request stays active until you fulfill or unpin it. Nothing expires.',
        targetSelector: '[data-accept-request]',
      };
    }
  }

  if (state.tier.unlockedCrops.length > 1 && !context.isSeen('open-mix-panel')) {
    return {
      id: 'open-mix-panel',
      icon: 'sliders',
      title: 'Tune Crop Mix',
      body: 'Mix is a target. Farmers still use carrot seeds if wheat seeds run out.',
      action: 'Open Crop Mix and adjust the crop sliders.',
      why: 'Crop mix tells workers which seeds to prefer as you unlock more crops.',
      targetSelector: '[data-panel="mix"]',
    };
  }

  if (state.tier.unlockedCrops.includes('tomato') && context.activePanel !== 'mix' && !context.isSeen('open-mix-for-tomatoes')) {
    return {
      id: 'open-mix-for-tomatoes',
      icon: 'tomato',
      title: 'Add Tomatoes To Mix',
      body: 'Tomatoes are unlocked. Crop Mix already gives them a starter share.',
      action: 'Open Crop Mix and check the Tomato percentage.',
      why: 'A tomato share tells workers to plant the new crop when tomato seeds and empty plots are ready.',
      targetSelector: '[data-panel="mix"]',
    };
  }

  return null;
}
