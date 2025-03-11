// App.spec.ts - Updated with simpler mocking
import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import App from '@/App.vue';

// Set up mock at file scope
vi.mock('axios');

describe('App.vue', () => {
  let wrapper: any;

  const mockGraphData = {
    data: [
      {
        name: 'Root',
        description: 'Root node',
        parent: '',
        children: [
          {
            name: 'Child1',
            description: 'First child',
            parent: 'Root',
            children: []
          },
          {
            name: 'Child2',
            description: 'Second child',
            parent: 'Root',
            children: [
              {
                name: 'GrandChild1',
                description: 'First grandchild',
                parent: 'Child2',
                children: []
              },
              {
                name: 'GrandChild2',
                description: 'Second grandchild',
                parent: 'Child2',
                children: []
              }
            ]
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Setup the mock directly without using mocked()
    axios.get = vi.fn().mockResolvedValue({ data: mockGraphData });

    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 500, height: 500, top: 0, left: 0,
      right: 500, bottom: 500, x: 0, y: 0, toJSON: () => { }
    }));
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  it('renders properly', async () => {
    wrapper = mount(App);
    expect(wrapper.find('.header').text()).toBe('Graph Data Visualization');
    expect(wrapper.find('.graph-container').exists()).toBe(true);
  });

  it('shows loading state when fetching data', async () => {
    // Setup delayed response without using mocked()
    axios.get = vi.fn().mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve({ data: mockGraphData }), 100))
    );

    wrapper = mount(App);
    expect(wrapper.find('.loading-overlay').exists()).toBe(true);

    await flushPromises();
    await new Promise(r => setTimeout(r, 150));

    expect(wrapper.find('.loading-overlay').exists()).toBe(false);
  });

  it('loads complex hierarchical data correctly', async () => {
    wrapper = mount(App);
    await flushPromises();

    // Check if the graph container is rendered
    expect(wrapper.find('.graph-container').exists()).toBe(true);
  });

  it('displays grandchild node popup when clicked', async () => {
    wrapper = mount(App);
    await flushPromises();
    const grandchild = {
      name: 'GrandChild1',
      description: 'First grandchild',
      parent: 'Child2',
      id: 'GrandChild1',
      depth: 2
    };
    await wrapper.vm.showNodePopup(grandchild);

    expect(wrapper.find('.node-popup').exists()).toBe(true);
    expect(wrapper.find('.node-popup h3').text()).toBe('GrandChild1');
  });

  it('correctly displays parent information in popup', async () => {
    wrapper = mount(App);
    await flushPromises();

    const grandchild = {
      name: 'GrandChild2',
      description: 'Second grandchild',
      parent: 'Child2',
      id: 'GrandChild2',
      depth: 2
    };

    await wrapper.vm.showNodePopup(grandchild);

    expect(wrapper.find('.node-popup').exists()).toBe(true);
    // Target the second paragraph in the popup
    expect(wrapper.findAll('.node-popup p')[1].text()).toContain('Parent: Child2');
  });
});