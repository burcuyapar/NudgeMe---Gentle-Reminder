export const COLORS = {
  softBlue: '#A8C5E8',
  lavender: '#C4B5E0',
  peach: '#FFD9C7',
  cream: '#FFF9F4',
  text: '#4A4A4A', // Adding a default text color for contrast
  white: '#FFFFFF',
  shadow: '#000000',
};

export const SIZES = {
  appName: 42,
  heading: 24,
  body: 16,
  small: 14,
  radius: 20, // 16-30px range
  padding: 20,
};

export const FONTS = {
  appName: { fontSize: SIZES.appName, fontWeight: 'bold' },
  heading: { fontSize: SIZES.heading, fontWeight: '600' },
  body: { fontSize: SIZES.body, fontWeight: 'normal' },
  small: { fontSize: SIZES.small, fontWeight: 'normal' },
};

export const SHADOWS = {
  soft: {
    shadowColor: COLORS.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
};
