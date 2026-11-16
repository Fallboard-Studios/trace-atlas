import { useCallback, type CSSProperties, type ReactNode } from 'react';
import type { CompanyOptions } from './useCompanyOptions';
import { LevelsMixSection, LevelsSendsSection } from '@/components/robot/LevelsSections';
import { CompositionDetailsSection, CompositionRhythmMelodySection } from '@/components/robot/CompositionSections';
import { EnvelopeCharacterSection, EnvelopeContourSection } from '@/components/robot/EnvelopeSections';
import { SignatureArrayLayer } from '@/components/robot/SignatureArrayDrawer';
import { BusFilterDrawer } from '@/components/robot/BusFilterDrawer';
import type { RobotSubsection } from '@/stores/uiStore';
import { SIGNATURE_ARRAY_CONFIG } from '@/data/robotOptionsConfig';
import { SOURCE_OSCILLATOR_SUBSECTIONS, type RobotOptionsTrait } from '@/data/robotSubsectionConfig';
import { getTraitColorStyle, getDisabledTraitColorStyle } from '@/utils/traitColors';

// Module-level (docs/tasks/archive/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up, 2026-09-15) — 'output'/
// 'composition'/'timeSpace'/'spectral' are literal constants, and `active` is a plain boolean, so
// picking between a fixed active/disabled pair per trait needs no memoization at all — the lookup
// below just selects one of these already-stable references, never constructs anything new.
//
// Record<RobotOptionsTrait, ...>, not a switch with a default — RobotOptionsTrait is exactly the
// 4 values ROBOT_SECTIONS_CONFIG can produce, so these object literals are compiler-checked
// exhaustive: a future section added there with a trait missing here fails npm run build:types,
// rather than silently rendering an unstyled panel at runtime (found in code review, 2026-09-27).
const ACTIVE_TRAIT_STYLES: Record<RobotOptionsTrait, CSSProperties> = {
  output: getTraitColorStyle('output'),
  composition: getTraitColorStyle('composition'),
  timeSpace: getTraitColorStyle('timeSpace'),
  spectral: getTraitColorStyle('spectral'),
};
const DISABLED_TRAIT_STYLES: Record<RobotOptionsTrait, CSSProperties> = {
  output: getDisabledTraitColorStyle('output'),
  composition: getDisabledTraitColorStyle('composition'),
  timeSpace: getDisabledTraitColorStyle('timeSpace'),
  spectral: getDisabledTraitColorStyle('spectral'),
};


/**
 * A section panel's trait colours: the trait's full-saturation pair while the panels can be edited, its
 * own two tones desaturated (rather than replaced) while there is nothing to edit — no members, or a
 * company that does not exist.
 */
export function companyTraitStyle(trait: RobotOptionsTrait, active: boolean): CSSProperties {
  return active ? ACTIVE_TRAIT_STYLES[trait] : DISABLED_TRAIT_STYLES[trait];
}

/**
 * The four sections' sub-tab panels in "company mode" (Roadmap Phase 10; docs/tasks/LAYOUT_REWORK.md Task 23;
 * docs/specs/CONTENT_LAYOUT.md §1.3) — the counterpart to the robot screen's own renderer. Each half (Mix, Sends,
 * Rhythm & Melody, Details, Contour, Character), `SignatureArrayLayer` and `BusFilterDrawer` get their values,
 * swelling flags and handlers from `useCompanyOptions` and their `disabled` from its `active`; all the logic is the
 * hook's. CompanyScreen mounts the result inside its SectionTabs, one sub-tab at a time.
 *
 * Returns one function from a subsection id to its panel, memoized on `options` — which keeps its identity
 * through every edit that changes nothing in it, so an unrelated robot edit re-renders no panel (and each
 * panel is itself a React.memo'd component that bails on an unchanged value).
 */
export function useCompanySubsectionRenderer(options: CompanyOptions): (subsectionId: RobotSubsection) => ReactNode {
  return useCallback((subsectionId: RobotSubsection): ReactNode => {
    const disabled = !options.active;
    // One half per sub-tab (docs/specs/CONTENT_LAYOUT.md §1.3), each given the values and handlers it took as a section.
    switch (subsectionId) {
      case 'mix':
        return (
          <LevelsMixSection
            value={options.audioSettingValue}
            disabled={disabled}
            onAudioModeChange={options.onAudioModeChange}
            onVolumeChange={options.onVolumeChange}
            onPanChange={options.onPanChange}
            onPanAutoChange={options.onPanAutoChange}
            onDynamicsChange={options.onDynamicsChange}
            volumeSwelling={options.volumeSwelling}
          />
        );
      case 'sends':
        return (
          <LevelsSendsSection
            value={options.audioSettingValue}
            disabled={disabled}
            onSendChange={options.onSendChange}
            sendSwelling={options.sendSwelling}
            heldOffSends={options.heldOffSends}
          />
        );
      case 'rhythmMelody':
        return (
          <CompositionRhythmMelodySection
            value={options.pingControlsValue}
            disabled={disabled}
            onDensityChange={options.onDensityChange}
            onMotifLengthChange={options.onMotifLengthChange}
            onPitchRepeatChange={options.onPitchRepeatChange}
            onNoteVarianceChange={options.onNoteVarianceChange}
            onClickTrackActiveChange={options.onClickTrackActiveChange}
          />
        );
      case 'details':
        return (
          <CompositionDetailsSection
            value={options.pingControlsValue}
            disabled={disabled}
            onRestsChange={options.onRestsChange}
            onAccentsChange={options.onAccentsChange}
            onOctaveMinChange={options.onOctaveMinChange}
            onOctaveMaxChange={options.onOctaveMaxChange}
          />
        );
      case 'envelopeContour':
        return (
          <EnvelopeContourSection value={options.adsrValue} disabled={disabled} onChange={options.onAdsrChange} swelling={options.adsrSwelling} />
        );
      case 'envelopeCharacter':
        return (
          <EnvelopeCharacterSection
            value={options.adsrValue}
            disabled={disabled}
            onChange={options.onAdsrChange}
            portamento={options.portamentoValue}
            onPortamentoChange={options.onPortamentoChange}
          />
        );
      case 'baselineOscillator':
      case 'coaxialOscillator':
      case 'harmonicOscillator': {
        const idx = SOURCE_OSCILLATOR_SUBSECTIONS.indexOf(subsectionId);
        const layer = options.signatureArrayValue.layers[idx];
        return layer ? (
          <SignatureArrayLayer
            block={SIGNATURE_ARRAY_CONFIG[idx]}
            idx={idx}
            layer={layer}
            lfoLinks={options.signatureArrayValue.lfoLinks}
            disabled={disabled}
            swelling={options.layerSwelling[idx]}
            onTypeChange={options.onLayerTypeChange}
            onParamChange={options.onLayerParamChange}
            onLfoFieldChange={options.onLayerLfoFieldChange}
          />
        ) : null;
      }
      case 'busFilter':
        return (
          <BusFilterDrawer
            value={options.busFilterValue}
            disabled={disabled}
            onChange={options.onBusFilterChange}
            onLfoLinkChange={options.onBusLinkChange}
            heldOff={options.busFilterLinksHeldOff}
          />
        );
      default:
        return null;
    }
  }, [options]);
}
