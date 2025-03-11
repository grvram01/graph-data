import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import App from '@/App.vue';


vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn()
    }
  };
});

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
          }
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // vi.mocked(axios.get).mockReset();
    vi.mocked(axios.get).mockResolvedValue({ data: mockGraphData });

    document.createElementNS = vi.fn().mockImplementation((namespaceURI, qualifiedName) => {
      return document.createElement(qualifiedName);
    });

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
    vi.mocked(axios.get).mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(() => resolve({ data: mockGraphData }), 100))
    );

    wrapper = mount(App);
    expect(wrapper.find('.loading-overlay').exists()).toBe(true);

    await flushPromises();
    await new Promise(r => setTimeout(r, 150));

    expect(wrapper.find('.loading-overlay').exists()).toBe(false);
  });

  it('displays the popup when a node is clicked', async () => {
    wrapper = mount(App);
    await flushPromises();

    const node = {
      name: 'Test Node',
      description: 'Test Description',
      parent: 'Parent Node',
      id: 'node1',
      depth: 1
    };
    await wrapper.vm.showNodePopup(node)
    await wrapper.vm.setPopupStyle({ top: '100px', left: '100px' });

    expect(wrapper.find('.node-popup').exists()).toBe(true);
    expect(wrapper.find('.node-popup h3').text()).toBe('Test Node');
  });

  it('closes the popup when close button is clicked', async () => {
    wrapper = mount(App);
    await flushPromises();

    const node = {
      name: 'Test Node',
      description: 'Test Description',
      parent: '',
      id: 'node1',
      depth: 0
    };
    wrapper.vm.setSelectedNode(node);
    wrapper.vm.setShowPopup(true);

    await wrapper.vm.closePopup();
    expect(wrapper.find('.node-popup').exists()).toBe(false);
  });
});
