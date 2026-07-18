import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";
import namesPlugin from "colord/plugins/names";

// Extend colord with accessibility and names plugins
extend([a11yPlugin, namesPlugin]);

interface ColorAnalysis {
  isLight: boolean;
  luminance: number;
  alpha: number;
  hsl: { h: number; s: number; l: number };
}

export function analyzeColor(color: string): ColorAnalysis {
  const c = colord(color);
  const luminance = c.luminance();
  const hsl = c.toHsl();

  return {
    isLight: luminance > 0.5,
    luminance,
    alpha: c.alpha(),
    hsl,
  };
}

export function getContrastRatio(foreground: string, background: string): number {
  const fg = colord(foreground);
  const bg = colord(background);
  return fg.contrast(bg);
}

function isLightNeutralBackground(hsl: ColorAnalysis["hsl"]): boolean {
  return hsl.l >= 90 && hsl.s <= 18;
}

export function transformBackgroundColor(color: string, neutralDarkBackground?: string): string {
  const { isLight, hsl, luminance, alpha } = analyzeColor(color);

  if (alpha < 1) {
    return color;
  }

  // Explicitly preserve very dark colors (black, near-black)
  // Increased threshold from 0.1 to 0.15 for extra safety margin
  // This ensures dark email backgrounds like #1D252C, #0046be are always preserved
  if (luminance < 0.15) {
    return color; // Pure black or near-black should be preserved
  }

  // Also preserve colors with very low lightness in HSL space
  // This catches edge cases where luminance calculation might vary
  if (hsl.l < 20) {
    return color; // Very dark colors should be preserved
  }

  if (!isLight) {
    return color; // Already dark, keep it
  }

  if (neutralDarkBackground && isLightNeutralBackground(hsl)) {
    return neutralDarkBackground;
  }

  // Dynamic transformation that preserves relative relationships
  // Uses mathematical functions instead of hardcoded ranges

  // Create an inverse transformation curve for lightness
  // Maps light range (50-100) to dark range while preserving relative differences
  const lightRange = 100 - 50; // Input range: 50% to 100% lightness

  // Normalize the input lightness to 0-1 range
  const normalizedInput = Math.max(0, Math.min(1, (hsl.l - 50) / lightRange));

  // Apply an inverse curve that creates more distinction for very light colors
  // Use a power function to create non-linear mapping that spreads out light colors
  const curveFactor = 2.0; // Increased to create more distinction
  const transformedValue = Math.pow(1 - normalizedInput, curveFactor);

  // Map back to our target dark range with better spread
  const targetLightness = 8 + transformedValue * (25 - 8); // Range from 8-25 for better distinction

  // Add a small offset to ensure relative differences are preserved
  // Use a more aggressive offset to ensure proper ordering
  const relativeOffset = (100 - hsl.l) * 0.5; // Even larger offset to preserve relationships
  const adjustedTargetLightness = targetLightness + relativeOffset;

  // Dynamic saturation adjustment based on original saturation and lightness
  // Very light colors get minimal saturation, others get proportionally reduced
  const saturationReduction = 0.2 + 0.6 * normalizedInput; // More reduction for lighter colors
  const targetSaturation = hsl.s * (1 - saturationReduction);

  return colord({
    h: hsl.h,
    s: Math.max(0, Math.min(100, targetSaturation)),
    l: Math.max(8, Math.min(25, adjustedTargetLightness)),
  }).toHex();
}

export function transformTextColor(color: string, backgroundColor: string): string {
  const bgAnalysis = analyzeColor(backgroundColor);
  const originalAlpha = analyzeColor(color).alpha;
  const opaqueColor = originalAlpha < 1 ? colord(color).alpha(1).toHex() : color;
  const textAnalysis = analyzeColor(opaqueColor);
  const restoreAlpha = (transformedColor: string) =>
    originalAlpha < 1
      ? colord(transformedColor).alpha(originalAlpha).toRgbString()
      : transformedColor;

  // If background is light, make text dark
  if (bgAnalysis.isLight) {
    if (textAnalysis.isLight) {
      // Light text on light background - make it dark
      return restoreAlpha(colord(opaqueColor).darken(0.7).toHex());
    }
    return color; // Dark text on light background is fine
  }

  // Background is dark, ensure text is light enough
  // Be more aggressive with very dark colors like #222222
  if (!textAnalysis.isLight) {
    const { hsl } = textAnalysis;

    // For very dark colors (luminance < 0.2), make them quite light
    if (textAnalysis.luminance < 0.2) {
      return restoreAlpha(
        colord({
          h: hsl.h,
          s: Math.min(hsl.s, 30), // Reduce saturation for better readability
          l: 92, // Make it quite light to ensure >0.8 luminance
        }).toHex(),
      );
    }

    // For moderately dark colors, preserve more hue but ensure good lightness
    const newLightness = Math.max(80, 90 - hsl.l * 0.2);
    return restoreAlpha(
      colord({
        h: hsl.h,
        s: Math.min(hsl.s, 50),
        l: newLightness,
      }).toHex(),
    );
  }

  // For light text on dark backgrounds, preserve or slightly enhance
  if (textAnalysis.isLight && textAnalysis.luminance < 0.75) {
    const { hsl } = textAnalysis;
    // Slightly brighten light colors that aren't bright enough
    return restoreAlpha(
      colord({
        h: hsl.h,
        s: hsl.s,
        l: Math.min(95, hsl.l + 5), // Slightly increase lightness
      }).toHex(),
    );
  }

  return color;
}

export function transformBrandColor(color: string): string {
  const { hsl, isLight, alpha } = analyzeColor(color);

  if (alpha < 1) {
    return color;
  }

  // For brand colors (links, buttons), preserve hue but adjust for dark mode visibility
  if (isLight) {
    // Light brand color - darken it slightly but keep it visible
    return colord({
      h: hsl.h,
      s: Math.max(hsl.s, 60),
      l: Math.max(35, hsl.l - 20),
    }).toHex();
  } else {
    // Dark brand color - lighten it for visibility on dark backgrounds
    return colord({
      h: hsl.h,
      s: Math.max(hsl.s, 60),
      l: Math.min(85, hsl.l + 30),
    }).toHex();
  }
}

export function transformBorderColor(color: string): string {
  const { luminance, alpha } = analyzeColor(color);

  if (alpha < 1) {
    return color;
  }

  // If border is very dark, lighten it for visibility on dark backgrounds
  if (luminance < 0.15) {
    return colord(color).lighten(0.5).toHex();
  }

  // If border is very light (like #F5F5F5), make it much more visible
  if (luminance > 0.9) {
    // Very light borders become medium-light gray for good visibility
    return "#666666";
  }

  // If border is moderately light (like #cccccc which has luminance ~0.76), make it darker but still visible
  if (luminance > 0.5) {
    // Create a medium gray that works well on dark backgrounds
    return "#555555";
  }

  // Medium-dark colors like #666666 (luminance ~0.26) should remain unchanged
  // as they provide good visibility on dark backgrounds
  // However, #666666 (luminance ~0.40) is actually in the medium-light range
  if (luminance > 0.35 && luminance <= 0.5) {
    return "#e6e6e6"; // Transform medium-light grays to lighter grays for dark mode
  }

  return color;
}

export function ensureContrast(
  foreground: string,
  background: string,
  minRatio: number = 4.5,
): string {
  const currentRatio = getContrastRatio(foreground, background);

  if (currentRatio >= minRatio) {
    return foreground;
  }

  // Adjust foreground color to meet contrast requirements more aggressively
  const fgColor = colord(foreground);
  const blackContrast = getContrastRatio("#000000", background);
  const whiteContrast = getContrastRatio("#ffffff", background);
  const shouldDarken = blackContrast >= whiteContrast;

  // For similar grays, we need a more aggressive approach
  const fgLuminance = analyzeColor(foreground).luminance;
  const bgLuminance = analyzeColor(background).luminance;

  // If colors are very similar (both medium grays), use high contrast values
  if (Math.abs(fgLuminance - bgLuminance) < 0.2) {
    return shouldDarken ? "#000000" : "#ffffff";
  }

  // Try multiple adjustment levels until we meet the contrast requirement
  for (let adjustment = 0.1; adjustment <= 1.0; adjustment += 0.1) {
    let candidate: string;

    if (shouldDarken) {
      // Light background, darken foreground
      candidate = fgColor.darken(adjustment).toHex();
    } else {
      // Dark background, lighten foreground more aggressively
      const lightened = fgColor.lighten(adjustment);
      // If still not light enough, increase lightness directly
      const hsl = lightened.toHsl();
      candidate = colord({
        h: hsl.h,
        s: hsl.s,
        l: Math.min(95, hsl.l + adjustment * 50), // More aggressive lightening
      }).toHex();
    }

    if (getContrastRatio(candidate, background) >= minRatio) {
      return candidate;
    }
  }

  // If still not meeting requirements, use high-contrast fallback
  return shouldDarken ? "#000000" : "#ffffff";
}

export function isValidColor(color: string): boolean {
  try {
    // First check for obviously invalid patterns
    if (!color || color.trim() === "") {
      return false;
    }

    // Reject LAB colors - they should be handled by the final regex cleanup
    // This prevents colord from parsing them incorrectly
    if (/lab\s*\(/i.test(color)) {
      return false;
    }

    // Check for invalid hex patterns
    if (
      color.startsWith("#") &&
      !/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)
    ) {
      return false;
    }

    // Check for invalid RGB/RGBA values
    const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      if (r > 255 || g > 255 || b > 255 || r < 0 || g < 0 || b < 0) {
        return false;
      }
    }

    const c = colord(color);
    return c.isValid();
  } catch {
    return false;
  }
}
