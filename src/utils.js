const hexString = (length) => {
  let string = '';

  while (string.length < length) {
    string += Math.random().toString(16).substring(2);
  }

  return string.substring(0, length);
}

module.exports = {
  hexString
};
