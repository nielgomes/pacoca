let timeouts = new Map<string, NodeJS.Timeout>();

export default function debounce(func: Function, delay: number, id: string) {
  // Cancelar timeout anterior com o mesmo ID se existir
  const existingTimeout = timeouts.get(id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    func();
    // Limpar após executar
    timeouts.delete(id);
  }, delay);

  timeouts.set(id, timeoutId);
}
