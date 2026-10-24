import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import { usePlannerStore } from '@/stores/planner'

const NOW = new Date(2026, 9, 23, 18, 0)

let wrapper: VueWrapper

function mountApp(): VueWrapper {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(App, { global: { plugins: [pinia] }, attachTo: document.body })
  return wrapper
}

/** Mount with config mode on, where the plan-editing controls are. */
async function mountConfig(): Promise<VueWrapper> {
  mountApp()
  await wrapper.get('button[role="switch"]').trigger('click')
  return wrapper
}

/** The exercise grid only; the diet grid below reuses the same markup. */
function ex() {
  return wrapper.get('[data-testid="exercise-grid"]')
}

function rowCells(name: string) {
  return wrapper.findAll(`button[aria-label^="${name},"]`)
}

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders the week label, the default rows and the reps chips', () => {
    mountApp()
    expect(wrapper.find('h1').text()).toBe('Oct 19 – Oct 25, 2026')
    expect(
      ex()
        .findAll('[data-testid="item-name"]')
        .map((n) => n.text()),
    ).toEqual(['Push-ups', 'Pull-ups', 'Squats', 'Back extensions', 'Kettlebell halos'])
    const chips = wrapper.findAll('[data-testid="item-detail"]').map((c) => c.text())
    expect(chips[0]).toBe('10 reps / set')
    expect(chips[4]).toBe('8 each side / set')
  })

  it('marks today’s column in the header and the cells', () => {
    mountApp()
    const heads = ex().findAll('[data-testid="day-head"]')
    expect(heads.map((h) => h.attributes('data-today') === 'true')).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ])
    expect(rowCells('Squats')[4]!.element.parentElement!.getAttribute('data-today')).toBe('true')
  })

  it('toggles a cell with aria-pressed and updates totals and footer counts', async () => {
    mountApp()
    const cell = rowCells('Push-ups')[1]!
    expect(cell.attributes('aria-pressed')).toBe('false')
    await cell.trigger('click')
    expect(cell.attributes('aria-pressed')).toBe('true')
    expect(cell.find('[data-on="true"]').text()).toBe('✓')
    expect(wrapper.get('[data-testid="grand-total"]').text()).toBe('1')
    expect(ex().findAll('[data-testid="day-count"]')[1]!.text()).toBe('1/3')
    expect(ex().findAll('[data-testid="row-total"]')[0]!.text()).toBe('1 / 4')
  })

  it('colours the footer count by whether the daily pick is met, exceeded or not', async () => {
    mountApp()
    const counts = () => ex().findAll('[data-testid="day-count"]')
    for (const name of ['Push-ups', 'Pull-ups', 'Squats']) await rowCells(name)[0]!.trigger('click')
    expect(counts()[0]!.attributes('data-tone')).toBe('met')
    await rowCells('Kettlebell halos')[0]!.trigger('click')
    expect(counts()[0]!.attributes('data-tone')).toBe('over')
    expect(counts()[1]!.attributes('data-tone')).toBe('under')
  })

  it('highlights the row total once the goal is reached, and steps the goal', async () => {
    await mountConfig()
    const total = () => ex().findAll('[data-testid="row-total"]')[3]!
    await rowCells('Back extensions')[0]!.trigger('click')
    expect(total().attributes('data-met')).toBe('false')
    const lower = wrapper.get('button[aria-label="Lower Back extensions goal"]')
    await lower.trigger('click')
    await lower.trigger('click')
    expect(total().text()).toBe('1 / 1')
    expect(total().attributes('data-met')).toBe('true')
    await lower.trigger('click')
    expect(total().text()).toBe('1 / 0')
    expect(total().attributes('data-met')).toBe('false')
    expect(lower.attributes('aria-disabled')).toBe('true')
    await lower.trigger('click')
    expect(total().text()).toBe('1 / 0')
    await wrapper.get('button[aria-label="Raise Back extensions goal"]').trigger('click')
    expect(total().text()).toBe('1 / 1')
  })

  it('navigates weeks and returns to this week', async () => {
    mountApp()
    await wrapper.get('button[title="Previous week"]').trigger('click')
    expect(wrapper.find('h1').text()).toBe('Oct 12 – Oct 18, 2026')
    await wrapper.get('button[title="Next week"]').trigger('click')
    await wrapper.get('button[title="Next week"]').trigger('click')
    expect(wrapper.find('h1').text()).toBe('Oct 26 – Nov 1, 2026')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'This Week')!
      .trigger('click')
    expect(wrapper.find('h1').text()).toBe('Oct 19 – Oct 25, 2026')
  })

  it('removes an exercise only after confirmation', async () => {
    await mountConfig()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const remove = wrapper.get('button[aria-label="Remove Squats"]')
    await remove.trigger('click')
    expect(confirm).toHaveBeenCalledWith('Remove Squats?')
    expect(rowCells('Squats')).toHaveLength(7)
    await remove.trigger('click')
    expect(rowCells('Squats')).toHaveLength(0)
  })

  it('prints via window.print', async () => {
    mountApp()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Print…')!
      .trigger('click')
    expect(print).toHaveBeenCalledOnce()
  })

  it('refreshes today when the tab becomes visible again', () => {
    mountApp()
    const store = usePlannerStore()
    vi.setSystemTime(new Date(2026, 9, 24, 0, 5))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.days.findIndex((d) => d.isToday)).toBe(5)
  })

  it('moves today at midnight in a tab that stays visible', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
    mountApp()
    const store = usePlannerStore()
    vi.setSystemTime(new Date(2026, 9, 24, 0, 0, 30))
    vi.advanceTimersByTime(60_000)
    expect(store.days.findIndex((d) => d.isToday)).toBe(5)
  })

  it('adopts changes another tab writes to storage', async () => {
    mountApp()
    const other = {
      plans: { '2026-10-19': [{ id: 'a', name: 'From other tab', reps: 5, target: 2 }] },
      log: { '2026-10-19': { a: [true, false, false, false, false, false, false] } },
    }
    localStorage.setItem('exercise-planner-v2', JSON.stringify(other))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'exercise-planner-v2', storageArea: localStorage }),
    )
    await wrapper.vm.$nextTick()
    expect(
      ex()
        .findAll('[data-testid="item-name"]')
        .map((n) => n.text()),
    ).toEqual(['From other tab'])
    expect(wrapper.get('[data-testid="grand-total"]').text()).toBe('1')
  })
})

describe('AddExerciseForm', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => wrapper?.unmount())

  it('adds an exercise on submit, keeping only digits in reps, then resets', async () => {
    await mountConfig()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('Lunges')
    const reps = wrapper.get('input[aria-label="Reps"]')
    await reps.setValue('1a2')
    expect((reps.element as HTMLInputElement).value).toBe('12')
    await wrapper
      .findAll('button[aria-pressed]')
      .find((b) => b.text() === 'each side, per set')!
      .trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('[data-testid="item-detail"]').at(-1)!.text()).toBe('12 each side / set')
    expect(ex().findAll('[data-testid="row-total"]').at(-1)!.text()).toBe('0 / 3')
    expect(
      (wrapper.get('input[aria-label="New exercise name"]').element as HTMLInputElement).value,
    ).toBe('')
    expect((reps.element as HTMLInputElement).value).toBe('')
    const perSet = wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'per set')!
    expect(perSet.attributes('aria-pressed')).toBe('true')
  })

  it('does nothing for an empty name', async () => {
    await mountConfig()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(ex().findAll('[data-testid="item-name"]')).toHaveLength(5)
  })

  it('shows an em dash when no reps are given', async () => {
    await mountConfig()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('Plank')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('[data-testid="item-detail"]').at(-1)!.text()).toBe('—')
  })
})

describe('SettingsPopover', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => wrapper?.unmount())

  const PANEL = '[role="group"][aria-label="Settings"]'

  function trigger() {
    return wrapper.findAll('button').find((b) => b.text().endsWith('Settings'))!
  }

  it('opens, changes accent and daily pick live, and closes on Escape', async () => {
    mountApp()
    expect(wrapper.find(PANEL).exists()).toBe(false)
    await trigger().trigger('click')
    expect(trigger().attributes('aria-expanded')).toBe('true')

    await wrapper.get('button[aria-label="Purple"]').trigger('click')
    expect(wrapper.get('button[aria-label="Purple"]').attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#bf5af2')

    await wrapper.get('button[aria-label="More exercises per day"]').trigger('click')
    expect(wrapper.find('[data-testid="pick-hint"]').text()).toBe(
      'Pick 4 exercises a day. Click a cell when it’s done.',
    )
    expect(ex().findAll('[data-testid="day-count"]')[0]!.text()).toBe('0/4')

    ;(wrapper.get('button[aria-label="Purple"]').element as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find(PANEL).exists()).toBe(false)
    expect(document.activeElement).toBe(trigger().element)
  })

  it('closes on an outside pointerdown but not on one inside', async () => {
    mountApp()
    await trigger().trigger('click')
    const panel = wrapper.get(PANEL).element
    panel.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find(PANEL).exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find(PANEL).exists()).toBe(false)
  })

  it('disables the daily-pick buttons at the 1–8 bounds', async () => {
    mountApp()
    await trigger().trigger('click')
    const fewer = wrapper.get('button[aria-label="Fewer exercises per day"]')
    await fewer.trigger('click')
    await fewer.trigger('click')
    expect(fewer.attributes('aria-disabled')).toBe('true')
    await fewer.trigger('click')
    expect(wrapper.get('[data-testid="daily-pick"]').text()).toBe('1')
  })
})

describe('export and import', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
  })
  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const EXPORT = {
    format: 'exercise-planner-export',
    version: 1,
    exercise: {
      plans: {
        '2026-10-12': [{ id: 'sq', name: 'Squats', reps: 15, target: 4 }],
        '2026-10-19': [{ id: 'sq', name: 'Squats', reps: 15, target: 4 }],
      },
      log: { '2026-10-19': { sq: [true, true, false, false, false, false, false] } },
    },
    diet: {
      plans: { '2026-10-19': [{ id: 'eggs', name: 'Eggs', target: 2 }] },
      log: { '2026-10-19': { eggs: [false, false, true, false, false, false, false] } },
    },
    settings: { accent: '#bf5af2', dailyPick: 2 },
  }

  async function openSettings(): Promise<void> {
    await wrapper
      .findAll('button')
      .find((b) => b.text().endsWith('Settings'))!
      .trigger('click')
  }

  function button(name: string) {
    return wrapper.findAll('button').find((b) => b.text() === name)!
  }

  /** jsdom cannot open a file picker; hand the input a file and fire `change`. */
  async function choose(file: File): Promise<void> {
    const input = wrapper.get('[data-testid="import-file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
  }

  function jsonFile(data: unknown): File {
    return new File([JSON.stringify(data)], 'export.json', { type: 'application/json' })
  }

  it('exports the plans, ticks and settings as a dated JSON file', async () => {
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn<(b: Blob) => string>((b) => {
      blob = b
      return 'blob:x'
    })
    URL.revokeObjectURL = vi.fn<(url: string) => void>()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    mountApp()
    await rowCells('Squats')[2]!.trigger('click')
    await openSettings()
    await button('Export').trigger('click')
    expect(click).toHaveBeenCalledOnce()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'exercise-planner-2026-10-23.json',
    )
    const file = JSON.parse(await blob!.text())
    expect(file).toMatchObject({
      format: 'exercise-planner-export',
      version: 1,
      settings: { accent: '#30d158', dailyPick: 3 },
    })
    expect(file.settings).not.toHaveProperty('theme')
    expect(file.exercise.log['2026-10-19'].sq[2]).toBe(true)
    expect(file.diet).toEqual({ plans: {}, log: {} })
  })

  it('opens the file picker from Import…', async () => {
    mountApp()
    await openSettings()
    const picker = vi.spyOn(
      wrapper.get('[data-testid="import-file"]').element as HTMLInputElement,
      'click',
    )
    await button('Import…').trigger('click')
    expect(picker).toHaveBeenCalledOnce()
  })

  it('summarises what a file adds, then merges it on Import', async () => {
    mountApp()
    await rowCells('Push-ups')[4]!.trigger('click')
    await openSettings()
    await wrapper.get('button[aria-label="Blue"]').trigger('click')
    await choose(jsonFile(EXPORT))
    // The tick gave this week its own plan, so only last week's exercise plan and this week's food
    // plan are new. Picking Blue saved settings, so the file's accent and daily pick don't apply.
    expect(wrapper.get('[data-testid="import-summary"]').text()).toBe(
      'Adds 2 weekly plans and 3 ticks. Existing plans and ticks stay as they are.',
    )
    expect(rowCells('Squats')[0]!.attributes('aria-pressed')).toBe('false')

    await button('Import').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toBe('Imported.')
    expect(wrapper.find('[data-testid="import-summary"]').exists()).toBe(false)
    expect(rowCells('Squats')[0]!.attributes('aria-pressed')).toBe('true')
    expect(rowCells('Push-ups')[4]!.attributes('aria-pressed')).toBe('true')
    expect(rowCells('Eggs')[2]!.attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0a84ff')
  })

  it('applies the file’s settings when this browser has none saved', async () => {
    mountApp()
    await openSettings()
    await choose(jsonFile(EXPORT))
    expect(wrapper.get('[data-testid="import-summary"]').text()).toBe(
      'Adds 3 weekly plans and 3 ticks, plus the accent and exercises per day. Existing plans and ticks stay as they are.',
    )
    await button('Import').trigger('click')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#bf5af2')
    expect(wrapper.get('[data-testid="daily-pick"]').text()).toBe('2')
  })

  it('uses the singular for one plan and one tick', async () => {
    mountApp()
    await openSettings()
    await wrapper.get('button[aria-label="Blue"]').trigger('click')
    await choose(
      jsonFile({
        format: 'exercise-planner-export',
        version: 1,
        exercise: {
          plans: { '2026-10-12': [] },
          log: { '2026-10-19': { pu: [true, false, false, false, false, false, false] } },
        },
      }),
    )
    expect(wrapper.get('[data-testid="import-summary"]').text()).toBe(
      'Adds 1 weekly plan and 1 tick. Existing plans and ticks stay as they are.',
    )
  })

  it('keeps the summary true when settings change while it is open', async () => {
    mountApp()
    await openSettings()
    await choose(jsonFile(EXPORT))
    expect(wrapper.get('[data-testid="import-summary"]').text()).toContain('plus the accent')
    await wrapper.get('button[aria-label="Blue"]').trigger('click')
    expect(wrapper.get('[data-testid="import-summary"]').text()).not.toContain('plus the accent')
    await button('Import').trigger('click')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0a84ff')
  })

  it('discards the file on Cancel', async () => {
    mountApp()
    await openSettings()
    await choose(jsonFile(EXPORT))
    await button('Cancel').trigger('click')
    expect(wrapper.find('[data-testid="import-summary"]').exists()).toBe(false)
    expect(rowCells('Squats')[0]!.attributes('aria-pressed')).toBe('false')
    expect(localStorage.getItem('exercise-planner-v2')).toBeNull()
  })

  it('says so when the file adds nothing', async () => {
    mountApp()
    await openSettings()
    await choose(jsonFile({ format: 'exercise-planner-export', version: 1 }))
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Nothing new: everything in that file is already here.',
    )
    expect(wrapper.find('[data-testid="import-summary"]').exists()).toBe(false)
  })

  it.each([
    ['not JSON', new File(['{oops'], 'x.json'), 'That file isn’t valid JSON.'],
    ['another format', jsonFile({ plans: {} }), 'That file isn’t an Exercise Planner export.'],
    [
      'a newer version',
      jsonFile({ format: 'exercise-planner-export', version: 2 }),
      'That export comes from a newer version of the app.',
    ],
  ])('rejects %s with an inline error and changes nothing', async (_, file, message) => {
    mountApp()
    await openSettings()
    await choose(file)
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toBe(message)
    expect(alert.attributes('data-tone')).toBe('error')
    expect(localStorage.length).toBe(0)
  })

  it('reports a file that cannot be read', async () => {
    mountApp()
    await openSettings()
    const file = jsonFile(EXPORT)
    vi.spyOn(file, 'text').mockRejectedValue(new Error('gone'))
    await choose(file)
    expect(wrapper.get('[role="alert"]').text()).toBe('That file couldn’t be read.')
  })

  it('ignores a change with no file, and clears the outcome when reopened', async () => {
    mountApp()
    await openSettings()
    await wrapper.get('[data-testid="import-file"]').trigger('change')
    await flushPromises()
    expect(wrapper.find('[role="alert"], [role="status"]').exists()).toBe(false)
    await choose(new File(['{oops'], 'x.json'))
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await openSettings()
    await openSettings()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('theme', () => {
  let listeners: ((ev: MediaQueryListEvent) => void)[]

  /** jsdom has no matchMedia, so stand in for the OS colour-scheme query. */
  function fakeColorScheme(dark: boolean): void {
    listeners = []
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: dark,
      media: query,
      addEventListener: (_: string, fn: (ev: MediaQueryListEvent) => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: (ev: MediaQueryListEvent) => void) =>
        (listeners = listeners.filter((l) => l !== fn)),
    }))
  }

  function isDarkClass(): boolean {
    return document.documentElement.classList.contains('dark')
  }

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    wrapper?.unmount()
    vi.unstubAllGlobals()
    document.documentElement.classList.remove('dark')
  })

  it('follows the OS setting by default, including later changes', async () => {
    fakeColorScheme(true)
    mountApp()
    expect(isDarkClass()).toBe(true)
    listeners.forEach((fn) => fn({ matches: false } as MediaQueryListEvent))
    await wrapper.vm.$nextTick()
    expect(isDarkClass()).toBe(false)
    wrapper.unmount()
    expect(listeners).toHaveLength(0)
  })

  it('switches theme from the settings panel and remembers it', async () => {
    fakeColorScheme(false)
    mountApp()
    expect(isDarkClass()).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text().endsWith('Settings'))!
      .trigger('click')
    const themeButton = (name: string) =>
      wrapper
        .get('[role="group"][aria-label="Theme"]')
        .findAll('button')
        .find((b) => b.text() === name)!

    expect(themeButton('System').attributes('aria-pressed')).toBe('true')
    await themeButton('Dark').trigger('click')
    expect(isDarkClass()).toBe(true)
    expect(themeButton('Dark').attributes('aria-pressed')).toBe('true')
    expect(JSON.parse(localStorage.getItem('exercise-planner-settings-v1')!).theme).toBe('dark')

    await themeButton('Light').trigger('click')
    expect(isDarkClass()).toBe(false)
  })

  it('treats System as light where matchMedia is unavailable', () => {
    mountApp()
    expect(isDarkClass()).toBe(false)
  })
})

describe('exercise weight', () => {
  beforeEach(() => {
    localStorage.clear()
    // jsdom has no modal dialogs; stand in for showModal/close, including the close event.
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    }
  })
  afterEach(() => wrapper?.unmount())

  function detail(name: string) {
    const row = ex()
      .findAll('[role="rowheader"]')
      .find((r) => r.get('[data-testid="item-name"]').text() === name)!
    return row
      .findAll('[data-testid="item-detail"]')
      .map((c) => c.text())
      .join(' · ')
  }

  it('adds an exercise with a weight, accepting a comma decimal', async () => {
    await mountConfig()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('Swings')
    await wrapper.get('input[aria-label="Reps"]').setValue('20')
    const weight = wrapper.get('input[aria-label="Weight in kg (optional)"]')
    await weight.setValue('16,5kg')
    expect((weight.element as HTMLInputElement).value).toBe('16.5')
    await wrapper.get('form').trigger('submit')
    expect(detail('Swings')).toBe('20 reps / set · 16.5 kg')
    expect((weight.element as HTMLInputElement).value).toBe('')
  })

  it('edits an existing exercise in a dialog', async () => {
    await mountConfig()
    expect(wrapper.find('dialog').exists()).toBe(false)
    await wrapper.get('button[aria-label="Edit Squats"]').trigger('click')
    const dialog = wrapper.get('dialog')
    expect((dialog.element as HTMLDialogElement).open).toBe(true)
    expect((dialog.get('input[data-field="reps"]').element as HTMLInputElement).value).toBe('15')

    await dialog.get('input[inputmode="decimal"]').setValue('12')
    await dialog.get('form').trigger('submit')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(detail('Squats')).toBe('15 reps / set · 12 kg')
  })

  it('discards changes on Cancel', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Edit Squats"]').trigger('click')
    const dialog = wrapper.get('dialog')
    await dialog.get('input[inputmode="decimal"]').setValue('40')
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(detail('Squats')).toBe('15 reps / set')
  })

  it('edits the name, reps and per-side count, keeping the goal', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Edit Kettlebell halos"]').trigger('click')
    const dialog = wrapper.get('dialog')
    const toggle = (name: string) =>
      dialog.findAll('button[aria-pressed]').find((b) => b.text() === name)!
    expect(toggle('each side, per set').attributes('aria-pressed')).toBe('true')
    await dialog.get('input:not([inputmode])').setValue('Halos')
    await dialog.get('input[data-field="reps"]').setValue('1x0')
    await toggle('per set').trigger('click')
    await dialog.get('form').trigger('submit')
    expect(detail('Halos')).toBe('10 reps / set')
    expect(ex().findAll('[data-testid="row-total"]').at(-1)!.text()).toBe('0 / 3')
  })

  it('closes the dialog when another tab deletes the exercise', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Edit Squats"]').trigger('click')
    const store = usePlannerStore()
    localStorage.setItem(
      'exercise-planner-v2',
      JSON.stringify({
        plans: { '2026-10-19': store.exercises.filter((e) => e.id !== 'sq') },
        log: {},
      }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'exercise-planner-v2', storageArea: localStorage }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('dialog').exists()).toBe(false)
  })

  it('stays open when another tab changes a different exercise', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Edit Squats"]').trigger('click')
    const store = usePlannerStore()
    localStorage.setItem(
      'exercise-planner-v2',
      JSON.stringify({
        plans: { '2026-10-19': store.exercises.filter((e) => e.id !== 'pu') },
        log: {},
      }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'exercise-planner-v2', storageArea: localStorage }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('dialog').exists()).toBe(true)
  })

  it('offers no edit button for foods', () => {
    mountApp()
    expect(wrapper.find('button[aria-label="Edit Vegetables"]').exists()).toBe(false)
  })
})

describe('config mode and weekly plans', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    }
  })
  afterEach(() => {
    wrapper?.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)

  function chips(name: string): string {
    const row = ex()
      .findAll('[role="rowheader"]')
      .find((r) => r.get('[data-testid="item-name"]').text() === name)!
    return row
      .findAll('[data-testid="item-detail"]')
      .map((c) => c.text())
      .join(' · ')
  }

  it('hides every editing control in normal mode but still ticks cells', async () => {
    mountApp()
    const toggle = wrapper.get('button[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
    expect(wrapper.find('button[aria-label^="Edit Squats"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label^="Remove"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label^="Raise"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="New exercise name"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="New food name"]').exists()).toBe(false)
    expect(button('Copy plan to next week')).toBeUndefined()

    await rowCells('Squats')[0]!.trigger('click')
    expect(rowCells('Squats')[0]!.attributes('aria-pressed')).toBe('true')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(wrapper.find('button[aria-label="Edit Squats"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Remove Fish"]').exists()).toBe(true)
    expect(wrapper.find('input[aria-label="New food name"]').exists()).toBe(true)
  })

  it('copies the plan to next week and shows it', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Edit Squats"]').trigger('click')
    const dialog = wrapper.get('dialog')
    await dialog.get('input[data-field="sets"]').setValue('3')
    await dialog.get('input[inputmode="decimal"]').setValue('12')
    await dialog.get('form').trigger('submit')
    expect(chips('Squats')).toBe('3 × 15 reps · 12 kg')

    const confirm = vi.spyOn(window, 'confirm')
    await button('Copy plan to next week')!.trigger('click')
    expect(confirm).not.toHaveBeenCalled()
    expect(wrapper.find('h1').text()).toBe('Oct 26 – Nov 1, 2026')
    expect(chips('Squats')).toBe('3 × 15 reps · 12 kg')
    expect(wrapper.find('[data-testid="carried-from"]').exists()).toBe(false)
  })

  it('asks before replacing a week that has its own plan', async () => {
    await mountConfig()
    await wrapper.get('button[title="Next week"]').trigger('click')
    await rowCells('Squats')[0]!.trigger('click')
    await wrapper.get('button[title="Previous week"]').trigger('click')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await button('Copy plan to next week')!.trigger('click')
    expect(confirm).toHaveBeenCalledWith(
      'Replace the plan for Oct 26 – Nov 1, 2026 with this week’s?',
    )
    expect(wrapper.find('h1').text()).toBe('Oct 19 – Oct 25, 2026')
  })

  it('says when a week’s plan is carried over from an earlier week', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Raise Squats goal"]').trigger('click')
    await wrapper.get('button[title="Next week"]').trigger('click')
    expect(wrapper.get('[data-testid="carried-from"]').text()).toContain('Oct 19 – Oct 25, 2026')
    await wrapper.get('button[aria-label="Raise Squats goal"]').trigger('click')
    expect(wrapper.find('[data-testid="carried-from"]').exists()).toBe(false)
  })

  it('names exercise and food sources separately once they differ', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Raise Squats goal"]').trigger('click')
    await wrapper.get('button[aria-label="Raise Fish goal"]').trigger('click')
    await wrapper.get('button[title="Next week"]').trigger('click')
    expect(wrapper.get('[data-testid="carried-from"]').text()).toBe(
      'Uses the plan from Oct 19 – Oct 25, 2026 until you change this week.',
    )
    await rowCells('Squats')[0]!.trigger('click')
    expect(wrapper.get('[data-testid="carried-from"]').text()).toBe(
      'Uses the plan for foods from Oct 19 – Oct 25, 2026 until you change them this week.',
    )
  })

  it('closes the edit dialog if the week changes under it', async () => {
    await mountConfig()
    await wrapper.get('button[aria-label="Edit Squats"]').trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(true)
    usePlannerStore().nextWeek()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('dialog').exists()).toBe(false)
  })

  it('adds an exercise with sets from the form', async () => {
    await mountConfig()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('Swings')
    await wrapper.get('input[aria-label="Sets (optional)"]').setValue('4x')
    await wrapper.get('input[aria-label="Reps"]').setValue('20')
    await wrapper.get('form').trigger('submit')
    expect(chips('Swings')).toBe('4 × 20 reps')
  })
})
