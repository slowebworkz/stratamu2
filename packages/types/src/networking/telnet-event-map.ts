// Example TelnetEventMap type. Replace with your actual event map.

export type TelnetEventMap = {
  connect: [clientId: string];
  disconnect: [clientId: string];
  message: [clientId: string, message: string];
  error: [clientId: string, error: Error];
  // Add more events as needed
};
