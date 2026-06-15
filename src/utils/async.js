export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const withTimeout = (promise, ms, timeoutMessage) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  Promise.resolve(promise).then(
    (value) => {
      clearTimeout(timeoutId);
      resolve(value);
    },
    (error) => {
      clearTimeout(timeoutId);
      reject(error);
    }
  );
});
