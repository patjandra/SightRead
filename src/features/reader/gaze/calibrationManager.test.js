import { describe, it, expect } from "vitest";
import {
  mapRawToCalibratedY,
  isProfileCalibrated,
  isCalibrationStale,
} from "./calibrationManager.js";
import { CALIBRATION_VERSION } from "../../../config.js";

const points = { top: 0.2, center: 0.5, bottom: 0.9 };
const calibrated = { points, calibrationVersion: CALIBRATION_VERSION };

describe("mapRawToCalibratedY", () => {
  it("maps the three anchors to 0 / 0.5 / 1", () => {
    expect(mapRawToCalibratedY(0.2, calibrated)).toBeCloseTo(0);
    expect(mapRawToCalibratedY(0.5, calibrated)).toBeCloseTo(0.5);
    expect(mapRawToCalibratedY(0.9, calibrated)).toBeCloseTo(1);
  });

  it("interpolates linearly within each segment", () => {
    // Halfway between top (0.2) and center (0.5) -> 0.25 on the 0..0.5 segment.
    expect(mapRawToCalibratedY(0.35, calibrated)).toBeCloseTo(0.25);
    // Halfway between center (0.5) and bottom (0.9) -> 0.75 on the 0.5..1 segment.
    expect(mapRawToCalibratedY(0.7, calibrated)).toBeCloseTo(0.75);
  });

  it("clamps readings beyond the calibrated range to [0,1]", () => {
    expect(mapRawToCalibratedY(-5, calibrated)).toBe(0);
    expect(mapRawToCalibratedY(5, calibrated)).toBe(1);
  });

  it("handles an unclamped raw signal (rawY may exceed [0,1])", () => {
    // The estimator no longer clamps rawY; the mapper must still normalize it.
    const wide = { points: { top: -0.1, center: 0.5, bottom: 1.3 }, calibrationVersion: CALIBRATION_VERSION };
    expect(mapRawToCalibratedY(-0.1, wide)).toBeCloseTo(0);
    expect(mapRawToCalibratedY(1.3, wide)).toBeCloseTo(1);
  });

  it("returns null when the profile is missing or has no points", () => {
    expect(mapRawToCalibratedY(0.5, null)).toBeNull();
    expect(mapRawToCalibratedY(0.5, {})).toBeNull();
  });

  it("returns null when a calibration point is not a finite number", () => {
    const bad = { points: { top: 0.2, center: NaN, bottom: 0.9 } };
    expect(mapRawToCalibratedY(0.5, bad)).toBeNull();
  });

  it("does not divide by zero when two anchors coincide", () => {
    const degenerate = { points: { top: 0.5, center: 0.5, bottom: 0.9 } };
    expect(mapRawToCalibratedY(0.5, degenerate)).toBe(0.5);
  });
});

describe("isProfileCalibrated", () => {
  it("is true only with points stamped at the current version", () => {
    expect(isProfileCalibrated(calibrated)).toBe(true);
  });

  it("is false for a profile from an older algorithm version", () => {
    expect(isProfileCalibrated({ points, calibrationVersion: CALIBRATION_VERSION - 1 })).toBe(false);
  });

  it("is false without points, or for null", () => {
    expect(isProfileCalibrated({ calibrationVersion: CALIBRATION_VERSION })).toBe(false);
    expect(isProfileCalibrated(null)).toBe(false);
  });
});

describe("isCalibrationStale", () => {
  it("is true for points saved under an older version", () => {
    expect(isCalibrationStale({ points, calibrationVersion: CALIBRATION_VERSION - 1 })).toBe(true);
  });

  it("is false when the version is current", () => {
    expect(isCalibrationStale(calibrated)).toBe(false);
  });

  it("is false without points (that's uncalibrated, not stale)", () => {
    expect(isCalibrationStale({ calibrationVersion: 1 })).toBe(false);
  });
});
