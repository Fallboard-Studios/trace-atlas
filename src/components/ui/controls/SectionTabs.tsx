import { memo, useId, useState, type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';

import { CabinetBox } from './CabinetBox';
import { labels, type ContentKey } from '@/content';
import { getTraitColorStyle } from '@/utils/traitColors';
import { CABINET_REST_POP } from '@/utils/cabinetGeometry';
import type { Trait } from '@/types/traits';
import './SectionTabs.css';

export interface SectionTabItem<Id extends string> {
  id: Id;
  /** One entry per section; the trigger reads its human name. */
  content: ContentKey;
  /** The trigger's accent. */
  trait: Trait;
  /** The section's panel. Called only while the section is the active one. */
  render: () => ReactNode;
}

interface SectionTabsProps<Id extends string> {
  items: readonly SectionTabItem<Id>[];
  value: Id;
  onValueChange: (id: Id) => void;
  /** The tablist's accessible name. */
  label: string;
  /** 'sub' is the second row nested inside a section's panel: the same tabs, compact labels. */
  variant?: 'section' | 'sub';
}

/** Calls an item's render() from inside its Tabs.Content, so it runs only while Radix has the panel mounted. */
function SectionPanel({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

/**
 * A screen's sections as a row of tabs (docs/specs/LAYOUT_REWORK.md §1.3): Radix Tabs whose triggers
 * are CabinetBoxes, one section in the DOM at a time. Each trigger is a native button with the
 * CabinetBox inside only drawing (Button's split). It is popped while active or hovered and otherwise
 * rests at CABINET_REST_POP, the way RadioButton's options do. Arrow keys, Home and End move the active
 * tab (Radix's automatic activation, so the focused tab is the active one). `Tabs.Content` keeps
 * Radix's default unmounting (no `forceMount`), and the panel's `render()` runs inside it, so an
 * inactive section's controls never exist. A `value` no item has falls back to the first item rather
 * than showing an empty pane. Nest a `variant="sub"` instance in a panel for the sub-tab row.
 */
function SectionTabsInner<Id extends string>({ items, value, onValueChange, label, variant = 'section' }: SectionTabsProps<Id>) {
  const instanceId = useId();
  const [hoveredId, setHoveredId] = useState<Id | null>(null);

  if (items.length === 0) return null;
  const active = items.some((item) => item.id === value) ? value : items[0].id;

  return (
    <Tabs.Root
      className={`section-tabs section-tabs--${variant}`}
      value={active}
      onValueChange={(next) => onValueChange(next as Id)}
    >
      <Tabs.List className="section-tabs__list" aria-label={label}>
        {items.map((item) => (
          <Tabs.Trigger
            key={item.id}
            value={item.id}
            className="section-tabs__trigger"
            style={getTraitColorStyle(item.trait)}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId((current) => (current === item.id ? null : current))}
          >
            <CabinetBox
              popped={item.id === active || item.id === hoveredId ? true : CABINET_REST_POP}
              timelineKey={`section-tab-${instanceId}-${item.id}`}
            >
              {labels(item.content).humanLabel}
            </CabinetBox>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {items.map((item) => (
        <Tabs.Content key={item.id} value={item.id} className="section-tabs__panel">
          <SectionPanel render={item.render} />
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

// React.memo (docs/COMPONENT_LIBRARY.md's memo boundary). The cast keeps the Id generic, which memo's
// own signature drops. A screen that builds `items` inline gets no benefit — the same implicit contract
// every primitive has.
export const SectionTabs = memo(SectionTabsInner) as typeof SectionTabsInner;
