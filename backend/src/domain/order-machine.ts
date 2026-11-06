export const terminal = ['DELIVERED', 'CLOSED', 'COMPLETED', 'CANCELLED'];
export const preReady = ['DRAFT', 'PLACED', 'ACCEPTED', 'IN_KITCHEN'];
const common: Record<string, string[]> = {
  DRAFT: ['PLACED'],
  PLACED: ['ACCEPTED'],
  ACCEPTED: ['IN_KITCHEN'],
  IN_KITCHEN: ['READY'],
};
const channels: Record<string, Record<string, string[]>> = {
  DELIVERY: {
    READY: ['ASSIGNING_RIDER'],
    ASSIGNING_RIDER: ['PICKED_UP'],
    PICKED_UP: ['ARRIVING'],
    ARRIVING: ['DELIVERED'],
  },
  DINE_IN: { READY: ['SERVED'], SERVED: ['CLOSED'] },
  TAKEAWAY: { READY: ['COMPLETED'] },
};
export class OrderTransitionService {
  static can(channel: string, from: string, to: string, restaurant = false) {
    if (terminal.includes(from)) return false;
    if (to === 'CANCELLED')
      return preReady.includes(from) || (restaurant && ['READY', 'ASSIGNING_RIDER'].includes(from));
    return [...(common[from] || []), ...(channels[channel]?.[from] || [])].includes(to);
  }
  static next(channel: string, from: string): string | undefined {
    return [...(common[from] || []), ...(channels[channel]?.[from] || [])][0];
  }
}
