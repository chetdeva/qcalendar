import icon from './icon.png';

/** The page title and tab icon every Quanttoria screen shares (same as the public website). */
export const siteMetadata = {
  title: 'Quanttoria | Personalized Learning for US Students',
  // Sign-in and the apps behind it are not for search results (the public website is home-ui).
  robots: { index: false, follow: false },
  icons: { icon: [{ url: icon.src, sizes: '192x192', type: 'image/png' }] },
};
