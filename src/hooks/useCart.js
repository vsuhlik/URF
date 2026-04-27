import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // adjust path if needed

export function useCart(eventId, cashierId) {
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch current cart
  const fetchCart = async () => {
    if (!eventId || !cashierId) return;
    const { data } = await supabase
      .from('cart_items')
      .select('item:items(*)')
      .eq('event_id', eventId)
      .eq('cashier_id', cashierId);
    setCartItems(data?.map(d => d.item) || []);
  };

  useEffect(() => {
    fetchCart();
  }, [eventId, cashierId]);

  // Add item to cart
  const addToCart = async (itemId) => {
    const { error } = await supabase
      .from('cart_items')
      .insert({ event_id: eventId, cashier_id: cashierId, item_id: itemId })
      .select();
    if (!error) fetchCart();
    return error;
  };

  // Remove item from cart
  const removeFromCart = async (itemId) => {
    await supabase
      .from('cart_items')
      .delete()
      .eq('item_id', itemId)
      .eq('event_id', eventId)
      .eq('cashier_id', cashierId);
    fetchCart();
  };

  // Clear entire cart
  const clearCart = async () => {
    await supabase
      .from('cart_items')
      .delete()
      .eq('event_id', eventId)
      .eq('cashier_id', cashierId);
    setCartItems([]);
  };

  // Complete sale using RPC, accepts totalAmount (inc. delivery fee if applicable)
  const completeSale = async (customerName, customerPhone, fulfillmentType, totalAmount) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('sell_items', {
      p_event_id: eventId,
      p_cashier_id: cashierId,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_fulfillment_type: fulfillmentType,
      p_total_amount: totalAmount
    });
    setLoading(false);
    if (error) throw error;
    if (data.success) setCartItems([]); // cart is empty after successful sale
    return data;
  };

  return {
    cartItems,
    loading,
    addToCart,
    removeFromCart,
    clearCart,
    completeSale,
    refreshCart: fetchCart
  };
}