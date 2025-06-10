import { Equipment, Player, EquipmentReview, PlayerEquipmentSetup } from './database'

// Display types for frontend (extends database types with computed/display fields)
export interface EquipmentDisplay extends Equipment {
  rating?: number
  reviewCount?: number
  description?: string
}

export interface PlayerDisplay extends Player {
  highestRating?: string
  style?: string
  currentSetup?: string
}

// Layout and SEO Props
export interface LayoutProps {
  title: string
  description?: string
  keywords?: string
  canonical?: string
  ogImage?: string
  structuredData?: object
  children?: any
}

// Page Component Props
export interface HomePageProps {
  featuredEquipment?: EquipmentDisplay[]
  popularPlayers?: PlayerDisplay[]
}

export interface EquipmentPageProps {
  equipment: Equipment
  reviews: EquipmentReview[]
  usedByPlayers?: Player[]
  similarEquipment?: Equipment[]
}

export interface PlayerPageProps {
  player: Player
  equipmentSetups: PlayerEquipmentSetup[]
  videos?: VideoItem[]
  careerStats?: CareerStats
}

export interface PlayerEditPageProps {
  player: Player
}

export interface SearchPageProps {
  query?: string
  results?: {
    equipment: Equipment[]
    players: Player[]
  }
  filters?: SearchFilters
}

// Component Props
export interface SearchBarProps {
  placeholder?: string
  initialValue?: string
  showFilters?: boolean
}

export interface ReviewCardProps {
  review: EquipmentReview
  equipment?: Equipment
  showEquipment?: boolean
}

export interface PlayerCardProps {
  player: Player
  showEquipment?: boolean
}

export interface EquipmentCardProps {
  equipment: Equipment
  showRating?: boolean
  showUsedBy?: boolean
}

export interface RatingStarsProps {
  rating: number
  count?: number
  size?: 'small' | 'medium' | 'large'
}

export interface BreadcrumbItem {
  label: string
  href?: string
  current?: boolean
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

// Filter and Search Types
export interface SearchFilters {
  category?: string
  brand?: string
  priceRange?: [number, number]
  rating?: number
  level?: string
  style?: string
}

// Timeline Component Props
export interface PlayerTimelineProps {
  equipmentSetups: PlayerEquipmentSetup[]
  playerId: string
}

export interface TimelineItemProps {
  year: number
  blade?: {
    name: string
    slug: string
  }
  forehand?: {
    name: string
    slug: string
    thickness?: string
    color?: string
  }
  backhand?: {
    name: string
    slug: string
    thickness?: string
    color?: string
  }
  source?: {
    text: string
    url: string
  }
}

// Utility Types
export interface NavItem {
  label: string
  href: string
  active?: boolean
}

export interface PlayerFormProps {
  player?: Player
  isEditing?: boolean
  className?: string
}

export interface VideoItem {
  id: string
  title: string
  url: string
  thumbnail?: string
  duration?: string
  description?: string
}

export interface CareerStats {
  bestRanking?: number
  currentRanking?: number
  titles?: number
  yearsActive?: string
  playingStyle?: string
  achievements?: string[]
}

export interface SiteConfig {
  siteName: string
  siteUrl: string
  description: string
  logo: string
  social: {
    discord: string
  }
}
