import { InteractionManager } from 'react-native';

// Run heavy tasks after animations complete
export const runAfterInteractions = (task) => {
  return InteractionManager.runAfterInteractions(task);
};

// Debounce function for search/input
export const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

// Throttle function for scroll/resize
export const throttle = (fn, ms = 100) => {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, ms);
    }
  };
};
