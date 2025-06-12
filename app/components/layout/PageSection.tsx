interface PageSectionProps {
  children: React.ReactNode;
  className?: string;
  background?: 'white' | 'gray';
  padding?: 'small' | 'medium' | 'large';
}

export function PageSection({ 
  children, 
  className = "", 
  background = 'white',
  padding = 'medium'
}: PageSectionProps) {
  const backgroundClasses = {
    white: 'bg-white',
    gray: 'bg-gray-100'
  };

  const paddingClasses = {
    small: 'py-6',
    medium: 'py-8',
    large: 'py-12'
  };

  return (
    <section className={`${backgroundClasses[background]} ${paddingClasses[padding]} ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}