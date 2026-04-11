import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import SkinPicker from '../SkinPicker.vue'

// The SkinPicker uses useTableSkin which reads from localStorage.
// We mock localStorage for isolation.
beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('SkinPicker', () => {
  it('renders the skin toggle button', () => {
    const wrapper = mount(SkinPicker, {
      global: { plugins: [createPinia()] }
    })
    expect(wrapper.find('.skin-toggle').exists()).toBe(true)
  })

  it('shows skin panel when toggle is clicked', async () => {
    const wrapper = mount(SkinPicker, {
      global: { plugins: [createPinia()] }
    })
    expect(wrapper.find('.skin-panel').exists()).toBe(false)
    await wrapper.find('.skin-toggle').trigger('click')
    expect(wrapper.find('.skin-panel').exists()).toBe(true)
  })

  it('renders skin options for all available skins', async () => {
    const wrapper = mount(SkinPicker, {
      global: { plugins: [createPinia()] }
    })
    await wrapper.find('.skin-toggle').trigger('click')
    const dots = wrapper.findAll('.skin-dot')
    expect(dots.length).toBeGreaterThanOrEqual(4) // classic_green, blue_ocean, red_mahogany, dark_night
  })

  it('marks current skin as active', async () => {
    localStorage.setItem('mahjong_table_skin', 'blue_ocean')
    const wrapper = mount(SkinPicker, {
      global: { plugins: [createPinia()] }
    })
    await wrapper.find('.skin-toggle').trigger('click')
    const activeDots = wrapper.findAll('.skin-dot.active')
    expect(activeDots.length).toBe(1)
  })

  it('hides panel after selecting a skin', async () => {
    const wrapper = mount(SkinPicker, {
      global: { plugins: [createPinia()] }
    })
    await wrapper.find('.skin-toggle').trigger('click')
    expect(wrapper.find('.skin-panel').exists()).toBe(true)
    const dots = wrapper.findAll('.skin-dot')
    await dots[1].trigger('click')
    expect(wrapper.find('.skin-panel').exists()).toBe(false)
  })
})
