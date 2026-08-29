import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { POSScreen } from './POSScreen';
import { useRestaurant } from '../../contexts/RestaurantContext';

jest.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: jest.fn() }));
jest.mock('./MenuCategoryPills', () => ({ MenuCategoryPills: () => null }));
jest.mock('./MenuItemCard', () => ({ MenuItemCard: () => null }));
jest.mock('./ModifierModal', () => ({ ModifierModal: () => null }));

const textContent = (children) => Array.isArray(children) ? children.map(textContent).join('') : String(children ?? '');
const findText = (root, value) => root.findAllByType(Text)
  .find((node) => textContent(node.props.children) === value);
const pressText = (root, value) => {
  let node = findText(root, value);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`No pressable ancestor for: ${value}`);
  return node.props.onPress();
};

describe('POS checkout flow', () => {
  let tree;

  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    if (tree) act(() => tree.unmount());
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('opens checkout, prevents duplicate submit and shows success', async () => {
    let resolveOrder;
    const createOrder = jest.fn(() => new Promise((resolve) => { resolveOrder = resolve; }));
    useRestaurant.mockReturnValue({
      categories: [],
      allMenuItems: [],
      filteredMenuItems: [{ id: 1 }],
      selectedCategoryId: null,
      selectCategory: jest.fn(),
      isLoadingMenu: false,
      menuError: null,
      fetchMenu: jest.fn(),
      selectedMenuItemForModal: null,
      isModifierModalOpen: false,
      openModifierModal: jest.fn(),
      closeModifierModal: jest.fn(),
      cart: [{ menuItem: { id: 1 } }],
      cartItemCount: 1,
      cartTotal: 54_000,
      addToCart: jest.fn(),
      clearCart: jest.fn(),
      tables: [{ id: 7, tableNumber: 4, status: 'AVAILABLE' }],
      createOrder
    });

    await act(async () => { tree = renderer.create(<POSScreen />); });
    await act(async () => { pressText(tree.root, 'XÁC NHẬN ĐƠN ➔'); });
    expect(findText(tree.root, 'Xác nhận đơn POS')).toBeTruthy();

    await act(async () => { pressText(tree.root, 'Bàn 04'); });
    await act(async () => { pressText(tree.root, 'Gửi đơn xuống bếp'); });

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith('DINE_IN', 7);
    expect(findText(tree.root, 'Đang gửi đơn...')).toBeTruthy();

    await act(async () => { pressText(tree.root, 'Đang gửi đơn...'); });
    expect(createOrder).toHaveBeenCalledTimes(1);

    await act(async () => { resolveOrder({ success: true, order: { id: 9, code: 'CRISPY-TEST-0009' } }); });
    expect(findText(tree.root, 'Đã tạo đơn CRISPY-TEST-0009 thành công.')).toBeTruthy();
  });

  it('creates a takeaway order without a table and allows retry after an error', async () => {
    const createOrder = jest.fn()
      .mockResolvedValueOnce({ success: false, error: 'Máy chủ đang bận' })
      .mockResolvedValueOnce({ success: true, order: { id: 10, code: 'CRISPY-TEST-0010' } });
    useRestaurant.mockReturnValue({
      categories: [], allMenuItems: [], filteredMenuItems: [{ id: 1 }],
      selectedCategoryId: null, selectCategory: jest.fn(), isLoadingMenu: false,
      menuError: null, fetchMenu: jest.fn(), selectedMenuItemForModal: null,
      isModifierModalOpen: false, openModifierModal: jest.fn(), closeModifierModal: jest.fn(),
      cartItemCount: 1, cartTotal: 54_000, addToCart: jest.fn(), clearCart: jest.fn(),
      tables: [], createOrder
    });

    await act(async () => { tree = renderer.create(<POSScreen />); });
    await act(async () => { pressText(tree.root, 'XÁC NHẬN ĐƠN ➔'); });
    await act(async () => { pressText(tree.root, 'Mang đi'); });
    await act(async () => { pressText(tree.root, 'Gửi đơn xuống bếp'); });

    expect(createOrder).toHaveBeenLastCalledWith('TAKE_AWAY', undefined);
    expect(findText(tree.root, 'Máy chủ đang bận')).toBeTruthy();

    await act(async () => { pressText(tree.root, 'Gửi đơn xuống bếp'); });
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(findText(tree.root, 'Đã tạo đơn CRISPY-TEST-0010 thành công.')).toBeTruthy();
  });
});
