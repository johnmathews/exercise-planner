import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import { DIET_KEY } from '@/lib/storage'

const NOW = new Date(2026, 9, 23, 18, 0)

let wrapper: VueWrapper

function mountApp(): VueWrapper {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(App, { global: { plugins: [pinia] }, attachTo: document.body })
  return wrapper
}

function diet() {
  return wrapper.get('[data-testid="diet-grid"]')
}

function cells(name: string) {
  return diet().findAll(`button[aria-label^="${name},"]`)
}

describe('DietSection', () => {
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

  it('renders below the exercises with the default foods and no reps chips', () => {
    mountApp()
    expect(wrapper.get('#diet-heading').text()).toBe('Diet')
    expect(
      diet()
        .findAll('[data-testid="item-name"]')
        .map((n) => n.text()),
    ).toEqual(['Vegetables', 'Fruit', 'Fish', 'Nuts'])
    expect(diet().findAll('[data-testid="item-detail"]')).toHaveLength(0)
    expect(diet().get('[role="columnheader"]').text()).toBe('Food')
    expect(diet().findAll('[data-testid="day-head"]')[4]!.attributes('data-today')).toBe('true')
  })

  it('ticks a food, updating its total, the footer, and goals met', async () => {
    mountApp()
    const goals = () => wrapper.get('[data-testid="diet-goals-met"]').text()
    expect(goals()).toBe('0 / 4')
    await cells('Fish')[0]!.trigger('click')
    await cells('Fish')[2]!.trigger('click')
    expect(cells('Fish')[2]!.attributes('aria-pressed')).toBe('true')
    const total = diet().findAll('[data-testid="row-total"]')[2]!
    expect(total.text()).toBe('2 / 2')
    expect(total.attributes('data-met')).toBe('true')
    const counts = diet().findAll('[data-testid="day-count"]')
    expect(counts.map((c) => c.text())).toEqual(['1', '0', '1', '0', '0', '0', '0'])
    expect(counts[0]!.attributes('data-tone')).toBe('plain')
    expect(counts[1]!.attributes('data-tone')).toBe('under')
    expect(goals()).toBe('1 / 4')
    // The exercise totals are untouched.
    expect(wrapper.get('[data-testid="grand-total"]').text()).toBe('0')
  })

  it('moves with the shared week navigation', async () => {
    mountApp()
    await cells('Fruit')[0]!.trigger('click')
    await wrapper.get('button[title="Previous week"]').trigger('click')
    expect(cells('Fruit')[0]!.attributes('aria-pressed')).toBe('false')
    await wrapper.get('button[title="Next week"]').trigger('click')
    expect(cells('Fruit')[0]!.attributes('aria-pressed')).toBe('true')
  })

  it('adds a food, persists it, and removes one after confirmation', async () => {
    mountApp()
    await wrapper.get('input[aria-label="New food name"]').setValue('Beans')
    await wrapper.get('input[aria-label="New food name"]').trigger('submit')
    expect(diet().findAll('[data-testid="item-name"]').at(-1)!.text()).toBe('Beans')
    expect(
      (wrapper.get('input[aria-label="New food name"]').element as HTMLInputElement).value,
    ).toBe('')
    await wrapper.vm.$nextTick()
    expect(JSON.parse(localStorage.getItem(DIET_KEY)!).foods.at(-1).name).toBe('Beans')

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await diet().get('button[aria-label="Remove Nuts"]').trigger('click')
    expect(cells('Nuts')).toHaveLength(0)
  })

  it('ignores an empty food name', async () => {
    mountApp()
    await wrapper.get('input[aria-label="New food name"]').setValue('   ')
    await wrapper.get('input[aria-label="New food name"]').trigger('submit')
    expect(cells('Vegetables')).toHaveLength(7)
    expect(diet().findAll('[role="row"]')).toHaveLength(6)
  })

  it('adjusts a food goal with the stepper', async () => {
    mountApp()
    await diet().get('button[aria-label="Lower Fish goal"]').trigger('click')
    expect(diet().findAll('[data-testid="row-total"]')[2]!.text()).toBe('0 / 1')
  })

  it('adopts another tab’s diet changes', async () => {
    mountApp()
    localStorage.setItem(
      DIET_KEY,
      JSON.stringify({ foods: [{ id: 'q', name: 'Quinoa', target: 2 }] }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: DIET_KEY, storageArea: localStorage }))
    await wrapper.vm.$nextTick()
    expect(
      diet()
        .findAll('[data-testid="item-name"]')
        .map((n) => n.text()),
    ).toEqual(['Quinoa'])
  })
})
