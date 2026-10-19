/**
 * The scenario picker at the top of the rail: choose a scenario (built in, Partner inputs, or
 * your own), and save, save as, revert, rename, duplicate or delete. Loading a scenario replaces
 * the params and their sources. Save and Revert are enabled only when the inputs differ from it.
 */
import { byId, byIdAs, h } from './dom';
import type { Params } from './params';
import type { ProvenanceMap } from './provenance';
import {
  matches,
  PARTNER,
  type SavedScenario,
  type ScenarioStore,
  WORKING,
  WORKING_SCENARIO,
} from './scenarios';
import type { Store } from './store';

export type ViewState = { active: string; focus: 'android' | 'ios' };

type PanelStores = {
  scenarios: ScenarioStore;
  params: Store<Params>;
  sources: Store<ProvenanceMap>;
  view: Store<ViewState>;
};

const option = (s: SavedScenario) => h('option', { value: s.id }, s.name);

/** Built in; Partner (always a slot, so the presenter sees where Almedia's numbers go); yours. */
function optionGroups(list: SavedScenario[]): HTMLElement[] {
  const partner = list.find((s) => s.id === PARTNER);
  const partnerOption = partner
    ? option(partner)
    : h('option', { value: '', disabled: '' }, 'Partner inputs (not saved yet)');
  const groups: [string, HTMLElement[]][] = [
    ['Built in', list.flatMap((s) => (s.builtIn ? [option(s)] : []))],
    ['Partner', [partnerOption]],
    ['Your scenarios', list.flatMap((s) => (!s.builtIn && s.id !== PARTNER ? [option(s)] : []))],
  ];
  return groups.flatMap(([label, options]) =>
    options.length ? [h('optgroup', { label }, ...options)] : [],
  );
}

export function mountScenarioPanel({ scenarios, params, sources, view }: PanelStores) {
  const select = byIdAs('scn-select', HTMLSelectElement);
  const menu = byIdAs('scn-menu', HTMLDetailsElement);
  const buttonEl = (id: string) => byIdAs(id, HTMLButtonElement);
  const active = (): SavedScenario => scenarios.get(view.get().active) ?? WORKING_SCENARIO;
  const isEdited = () => !matches(active(), params.get(), sources.get());
  const show = (id: string) => view.set({ active: id });

  function load(id: string) {
    const s = scenarios.get(id);
    if (!s) return;
    view.set({ active: id });
    sources.replace(s.provenance);
    params.replace(s.params);
  }

  select.addEventListener('change', () => {
    if (isEdited() && !confirm(`Discard unsaved changes to “${active().name}”?`)) {
      show(active().id); // puts the picker back
      return;
    }
    load(select.value);
  });
  buttonEl('scn-partner').addEventListener('click', () =>
    show(scenarios.savePartner(params.get(), sources.get()).id),
  );
  buttonEl('scn-save').addEventListener('click', () => {
    scenarios.save(active().id, params.get(), sources.get());
    show(active().id);
  });
  buttonEl('scn-saveas').addEventListener('click', () => {
    const s = scenarios.saveAs(prompt('Name for this scenario') ?? '', params.get(), sources.get());
    show(s ? s.id : active().id);
  });
  buttonEl('scn-revert').addEventListener('click', () => load(active().id));
  buttonEl('scn-rename').addEventListener('click', () => {
    menu.open = false;
    scenarios.rename(active().id, prompt('Rename scenario', active().name) ?? '');
    show(active().id);
  });
  buttonEl('scn-duplicate').addEventListener('click', () => {
    menu.open = false;
    const copy = scenarios.duplicate(active().id);
    if (copy) scenarios.save(copy.id, params.get(), sources.get()); // the copy keeps unsaved edits
    show(copy ? copy.id : active().id);
  });
  buttonEl('scn-delete').addEventListener('click', () => {
    menu.open = false;
    const s = active();
    if (!confirm(`Delete the scenario “${s.name}”? The current inputs stay on screen.`)) return;
    scenarios.remove(s.id);
    show(WORKING);
  });

  return {
    render() {
      const s = active();
      const edited = isEdited();
      select.replaceChildren(...optionGroups(scenarios.all()));
      select.value = s.id;
      byId('scn-desc').textContent = s.description;
      buttonEl('scn-save').disabled = s.builtIn || !edited;
      buttonEl('scn-revert').disabled = !edited;
      buttonEl('scn-rename').disabled = s.builtIn;
      buttonEl('scn-delete').disabled = s.builtIn;
    },
  };
}
