import { describe, expect, it } from 'vitest'
import { decimalOnly, digitsOnly, useExerciseForm } from '@/composables/exerciseForm'

describe('input cleaning', () => {
  it('keeps only digits for reps', () => {
    expect(digitsOnly('1a2.5')).toBe('125')
  })

  it('keeps digits and one decimal point for weight, reading a comma as the point', () => {
    expect(decimalOnly('12')).toBe('12')
    expect(decimalOnly('2,5')).toBe('2.5')
    expect(decimalOnly('1.2.3kg')).toBe('1.23')
    expect(decimalOnly('.5')).toBe('.5')
    expect(decimalOnly('abc')).toBe('')
  })
})

describe('useExerciseForm', () => {
  it('loads an exercise, reports its value, and resets', () => {
    const form = useExerciseForm()
    form.load({
      id: 'kh',
      name: 'Kettlebell halos',
      sets: 3,
      reps: 8,
      perSide: true,
      weight: 8,
      target: 3,
    })
    expect(form.value()).toEqual({
      name: 'Kettlebell halos',
      sets: 3,
      reps: 8,
      perSide: true,
      weight: 8,
    })
    expect(form.sets.value).toBe('3')
    form.load()
    expect(form.value()).toStrictEqual({
      name: '',
      sets: undefined,
      reps: 0,
      perSide: false,
      weight: undefined,
    })
  })
})
