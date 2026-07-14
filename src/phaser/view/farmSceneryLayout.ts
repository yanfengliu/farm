export const FARM_ENVIRONMENT_MARGIN_TILES = 14;

export interface FarmSceneryLayout {
  farm: PixelBounds;
  environment: PixelBounds;
  frame: PixelBounds;
  creek: {
    centerX: number;
    width: number;
    bridgeY: number;
  };
  cottage: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  garden: PixelBounds;
  sign: { x: number; y: number };
}

export interface PixelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function buildFarmSceneryLayout(width: number, height: number, tileSize: number): FarmSceneryLayout {
  const farmRight = width * tileSize;
  const farmBottom = height * tileSize;
  const margin = FARM_ENVIRONMENT_MARGIN_TILES * tileSize;
  const cottage = { x: farmRight + 18, y: 18, width: 58, height: 58 };
  const garden = {
    left: cottage.x - 7,
    top: cottage.y + cottage.height + 9,
    right: cottage.x + cottage.width + 34,
    bottom: cottage.y + cottage.height + 69,
  };

  return {
    farm: { left: 0, top: 0, right: farmRight, bottom: farmBottom },
    environment: { left: -margin, top: -margin, right: farmRight + margin, bottom: farmBottom + margin },
    frame: {
      left: -104,
      top: -56,
      right: Math.max(farmRight + 104, garden.right + 8),
      bottom: Math.max(farmBottom + 48, garden.bottom + 10),
    },
    creek: {
      centerX: -69,
      width: 33,
      bridgeY: Math.round(farmBottom * 0.54),
    },
    cottage,
    garden,
    sign: { x: farmRight + 4, y: garden.bottom + 25 },
  };
}
