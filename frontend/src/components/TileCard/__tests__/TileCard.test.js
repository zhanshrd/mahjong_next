import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TileCard from '../TileCard.vue'

describe('TileCard', () => {
  it('renders tile face with correct suit class for wan tiles', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1' } })
    const face = wrapper.find('.tile-face')
    expect(face.classes()).toContain('wan')
    expect(face.classes()).toContain('W1')
    expect(face.find('.tile-number').text()).toBe('一')
    expect(face.find('.tile-suit').text()).toBe('万')
  })

  it('renders tile face for tiao tiles', () => {
    const wrapper = mount(TileCard, { props: { tile: 'T5' } })
    const face = wrapper.find('.tile-face')
    expect(face.classes()).toContain('tiao')
    expect(face.find('.tile-number').text()).toBe('五')
    expect(face.find('.tile-suit').text()).toBe('条')
  })

  it('renders tile face for tong tiles', () => {
    const wrapper = mount(TileCard, { props: { tile: 'D9' } })
    const face = wrapper.find('.tile-face')
    expect(face.classes()).toContain('tong')
    expect(face.find('.tile-number').text()).toBe('九')
    expect(face.find('.tile-suit').text()).toBe('筒')
  })

  it('renders wind tiles with correct name', () => {
    const wrapper = mount(TileCard, { props: { tile: 'FE' } })
    const face = wrapper.find('.tile-face')
    expect(face.classes()).toContain('wind')
    expect(face.find('.tile-number').text()).toBe('东')
    expect(face.find('.tile-suit').exists()).toBe(false)
  })

  it('renders dragon tiles with correct name', () => {
    const wrapper = mount(TileCard, { props: { tile: 'JC' } })
    const face = wrapper.find('.tile-face')
    expect(face.classes()).toContain('dragon')
    expect(face.find('.tile-number').text()).toBe('中')
  })

  it('renders back side when backSide prop is true', () => {
    const wrapper = mount(TileCard, { props: { backSide: true } })
    expect(wrapper.find('.tile-back').exists()).toBe(true)
    expect(wrapper.find('.tile-face').exists()).toBe(false)
    expect(wrapper.classes()).toContain('back-side')
  })

  it('renders mini mode with count', () => {
    const wrapper = mount(TileCard, { props: { mini: true, miniCount: 13 } })
    expect(wrapper.find('.tile-mini').exists()).toBe(true)
    expect(wrapper.find('.mini-count').text()).toBe('13')
    expect(wrapper.classes()).toContain('mini')
  })

  it('applies small class when small prop is true', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1', small: true } })
    expect(wrapper.classes()).toContain('small')
  })

  it('applies rotation style when rotation prop is non-zero', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1', rotation: 180 } })
    const style = wrapper.attributes('style')
    expect(style).toContain('rotate(180deg)')
  })

  it('does not apply rotation style when rotation is 0', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1', rotation: 0 } })
    const style = wrapper.attributes('style')
    expect(style).toBeUndefined()
  })

  it('applies rotation style for 90 degrees (left player)', () => {
    const wrapper = mount(TileCard, { props: { tile: 'T3', rotation: 90 } })
    const style = wrapper.attributes('style')
    expect(style).toContain('rotate(90deg)')
  })

  it('applies rotation style for 270 degrees (right player)', () => {
    const wrapper = mount(TileCard, { props: { tile: 'D7', rotation: 270 } })
    const style = wrapper.attributes('style')
    expect(style).toContain('rotate(270deg)')
  })

  it('emits click event when selectable and clicked', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1', selectable: true } })
    wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
    expect(wrapper.emitted('click')[0]).toEqual(['W1'])
  })

  it('does not emit click event when not selectable', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1', selectable: false } })
    wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  it('applies selected class when selected prop is true', () => {
    const wrapper = mount(TileCard, { props: { tile: 'W1', selected: true } })
    expect(wrapper.classes()).toContain('selected')
  })
})
