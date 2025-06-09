import { BreadcrumbProps, BreadcrumbItem } from '../../types/components'

export function Breadcrumb({ items }: BreadcrumbProps) {
  if (!items.length) return null

  return (
    <nav class="breadcrumb bg-white border-b border-gray-200 py-3">
      <div class="breadcrumb-container max-w-6xl mx-auto px-4">
        <div class="breadcrumb-nav flex items-center gap-2 text-sm text-gray-600">
          {items.map((item, index) => (
            <div key={index} class="flex items-center gap-2">
              {index > 0 && <span class="breadcrumb-separator text-gray-400 font-bold">›</span>}

              {item.current ? (
                <span class="breadcrumb-current text-gray-900 font-medium">{item.label}</span>
              ) : (
                <a
                  href={item.href}
                  class="breadcrumb-link text-gray-600 hover:text-purple-600 hover:underline transition-colors"
                  onclick={`navigate('${item.href}'); return false;`}
                >
                  {item.label}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </nav>
  )
}

export function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(segment => segment)
  if (segments.length === 0) return []

  const breadcrumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }]

  // Equipment breadcrumbs
  if (segments[0] === 'equipment') {
    breadcrumbs.push({ label: 'Equipment', href: '/equipment' })

    if (segments[1]) {
      const equipmentNames: Record<string, string> = {
        'butterfly-tenergy-64': 'Butterfly Tenergy 64',
        'tsp-curl-p1-r': 'TSP Curl P1-R',
        'stiga-clipper': 'Stiga Clipper',
        blades: 'Blades',
        'forehand-rubbers': 'Forehand Rubbers',
        'backhand-rubbers': 'Backhand Rubbers',
        'long-pips': 'Long Pips',
        'anti-spin': 'Anti-Spin',
        training: 'Training Equipment',
      }

      const equipmentName = equipmentNames[segments[1]] || segments[1].replace(/-/g, ' ')
      breadcrumbs.push({ label: equipmentName, href: pathname, current: true })
    }
  }

  // Player breadcrumbs
  if (segments[0] === 'players') {
    breadcrumbs.push({ label: 'Players', href: '/players' })

    if (segments[1]) {
      const playerNames: Record<string, string> = {
        'joo-saehyuk': 'Joo Saehyuk',
        'ma-long': 'Ma Long',
        'timo-boll': 'Timo Boll',
      }

      const playerName = playerNames[segments[1]] || segments[1].replace(/-/g, ' ')
      breadcrumbs.push({ label: playerName, href: pathname, current: true })
    }
  }

  // Search breadcrumbs
  if (segments[0] === 'search') {
    breadcrumbs.push({ label: 'Search Results', href: pathname, current: true })
  }

  return breadcrumbs
}
