import { describe, expect, it } from 'vitest';
import { estimateStrength, generatePassword, MIN_PASSWORD_LENGTH } from './password';

describe('generatePassword', () => {
  it('produces long, varied, unique passwords', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).toHaveLength(20);
    expect(a).not.toBe(b);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/\d/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
    expect(estimateStrength(a).score).toBeGreaterThanOrEqual(3);
  });
  it('respects the requested length', () => {
    expect(generatePassword(32)).toHaveLength(32);
  });
});

describe('estimateStrength', () => {
  it('caps short passwords', () => {
    expect(estimateStrength('Ab1!').score).toBeLessThanOrEqual(1);
    expect(estimateStrength('').label).toBe('Very weak');
  });
  it('rewards length and variety', () => {
    expect(estimateStrength('correct-Horse-battery-9').score).toBe(4);
    expect('x'.repeat(MIN_PASSWORD_LENGTH)).toHaveLength(12);
  });
  it('penalises obvious patterns', () => {
    expect(estimateStrength('Password12345!').score).toBeLessThan(estimateStrength('Tz9!qLm2#vRp4w').score);
  });
});
