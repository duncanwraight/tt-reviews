import { FC } from 'hono/jsx'
import { LayoutProps } from '../types/components'
import { siteConfig, defaultSEO } from '../config/site'
import { ClientScript } from './ClientScript'

export const Layout: FC<LayoutProps> = ({
  title,
  description = defaultSEO.description,
  keywords = defaultSEO.keywords,
  canonical,
  ogImage = defaultSEO.ogImage,
  structuredData,
  children,
}: LayoutProps) => {
  const fullTitle = title.includes(siteConfig.siteName)
    ? title
    : `${title} | ${siteConfig.siteName}`
  const fullCanonical = canonical || siteConfig.siteUrl

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <link rel="canonical" href={fullCanonical} />

        {/* Open Graph */}
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={fullCanonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={siteConfig.siteName} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />

        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />

        {/* Structured Data */}
        {structuredData && (
          <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        )}

        {/* Tailwind CSS */}
        <script src="https://cdn.tailwindcss.com"></script>
        {/* Modular CSS and Configuration */}
        <link rel="stylesheet" href="/client/styles.css" />
        <script src="/client/config.js"></script>
      </head>
      <body>
        <Header />
        <main>{children}</main>
        <ClientScript />
      </body>
    </html>
  )
}

const Header: FC = () => {
  return (
    <header class="header">
      <div class="header-container">
        <a href="/" class="logo" onclick="navigate('/')">
          TT Reviews
        </a>

        <div class="search-container">
          <input
            type="text"
            class="search-input"
            placeholder="Search equipment, players, or reviews..."
          />
        </div>

        <nav class="nav-menu">
          <a href="/equipment" class="nav-link" onclick="navigate('/equipment')">
            Equipment
          </a>
          <a href="/players" class="nav-link" onclick="navigate('/players')">
            Players
          </a>
          <a
            href="https://discord.gg/Ycp7mKA3Yw"
            class="discord-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
            </svg>
            <span class="discord-text">OOAK</span>
          </a>
          <a href="/login" class="login-btn" id="authButton">
            Login
          </a>
        </nav>

        <button class="mobile-menu-toggle">☰</button>
      </div>
    </header>
  )
}
