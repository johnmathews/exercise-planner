import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
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
    expect(wrapper.findAll('[role="rowheader"] .name').map((n) => n.text())).toEqual([
      'Push-ups',
      'Pull-ups',
      'Squats',
      'Back extensions',
      'Kettlebell halos',
    ])
    const chips = wrapper.findAll('.chip').map((c) => c.text())
    expect(chips[0]).toBe('10 reps / set')
    expect(chips[4]).toBe('8 each side / set')
  })

  it('marks today’s column in the header and the cells', () => {
    mountApp()
    const heads = wrapper.findAll('.day-head')
    expect(heads.map((h) => h.classes('today'))).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ])
    expect(rowCells('Squats')[4]!.element.parentElement!.classList.contains('today')).toBe(true)
  })

  it('toggles a cell with aria-pressed and updates totals and footer counts', async () => {
    mountApp()
    const cell = rowCells('Push-ups')[1]!
    expect(cell.attributes('aria-pressed')).toBe('false')
    await cell.trigger('click')
    expect(cell.attributes('aria-pressed')).toBe('true')
    expect(cell.find('[data-on="true"]').text()).toBe('✓')
    expect(wrapper.get('[data-testid="grand-total"]').text()).toBe('1')
    expect(wrapper.findAll('[data-testid="day-count"]')[1]!.text()).toBe('1/3')
    expect(wrapper.findAll('[data-testid="row-total"]')[0]!.text()).toBe('1 / 4')
  })

  it('colours the footer count by whether the daily pick is met, exceeded or not', async () => {
    mountApp()
    const counts = () => wrapper.findAll('[data-testid="day-count"]')
    for (const name of ['Push-ups', 'Pull-ups', 'Squats']) await rowCells(name)[0]!.trigger('click')
    expect(counts()[0]!.classes()).toContain('met')
    await rowCells('Kettlebell halos')[0]!.trigger('click')
    expect(counts()[0]!.classes()).toContain('over')
    expect(counts()[1]!.classes()).toContain('under')
  })

  it('highlights the row total once the goal is reached, and steps the goal', async () => {
    mountApp()
    const total = () => wrapper.findAll('[data-testid="row-total"]')[3]!
    await rowCells('Back extensions')[0]!.trigger('click')
    expect(total().classes()).not.toContain('met')
    const lower = wrapper.get('button[aria-label="Lower Back extensions goal"]')
    await lower.trigger('click')
    await lower.trigger('click')
    expect(total().text()).toBe('1 / 1')
    expect(total().classes()).toContain('met')
    await lower.trigger('click')
    expect(total().text()).toBe('1 / 0')
    expect(total().classes()).not.toContain('met')
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
    mountApp()
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
      exercises: [{ id: 'a', name: 'From other tab', reps: 5, target: 2 }],
      log: { '2026-10-19': { a: [true, false, false, false, false, false, false] } },
    }
    localStorage.setItem('exercise-planner-v1', JSON.stringify(other))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'exercise-planner-v1', storageArea: localStorage }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[role="rowheader"] .name').map((n) => n.text())).toEqual([
      'From other tab',
    ])
    expect(wrapper.get('[data-testid="grand-total"]').text()).toBe('1')
  })
})

describe('AddExerciseForm', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => wrapper?.unmount())

  it('adds an exercise on submit, keeping only digits in reps, then resets', async () => {
    mountApp()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('Lunges')
    const reps = wrapper.get('input[aria-label="Reps"]')
    await reps.setValue('1a2')
    expect((reps.element as HTMLInputElement).value).toBe('12')
    await wrapper
      .findAll('button[aria-pressed]')
      .find((b) => b.text() === 'each side, per set')!
      .trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('.chip').at(-1)!.text()).toBe('12 each side / set')
    expect(wrapper.findAll('[data-testid="row-total"]').at(-1)!.text()).toBe('0 / 3')
    expect(
      (wrapper.get('input[aria-label="New exercise name"]').element as HTMLInputElement).value,
    ).toBe('')
    expect((reps.element as HTMLInputElement).value).toBe('')
    const perSet = wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'per set')!
    expect(perSet.attributes('aria-pressed')).toBe('true')
  })

  it('does nothing for an empty name', async () => {
    mountApp()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('[role="rowheader"] .name')).toHaveLength(5)
  })

  it('shows an em dash when no reps are given', async () => {
    mountApp()
    await wrapper.get('input[aria-label="New exercise name"]').setValue('Plank')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('.chip').at(-1)!.text()).toBe('—')
  })
})

describe('SettingsPopover', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => wrapper?.unmount())

  const PANEL = '[role="group"][aria-label="Settings"]'

  function trigger() {
    return wrapper.findAll('button').find((b) => b.text() === 'Settings')!
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
    expect(wrapper.find('.sub').text()).toBe('Pick 4 exercises a day. Click a cell when it’s done.')
    expect(wrapper.findAll('[data-testid="day-count"]')[0]!.text()).toBe('0/4')

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
    expect(wrapper.get('.pick-value').text()).toBe('1')
  })
})
