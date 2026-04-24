import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { motion } from 'motion/react';

interface NewsCardProps {
  title: string;
  description: string;
  date: string;
  imageUrl?: string;
  onReadMore?: () => void;
}

export function NewsCard({ title, description, date, imageUrl, onReadMore }: NewsCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="inline-block w-full"
    >
      <Card className="overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md hover:shadow-black/5 border-transparent hover:border-natural-primary/20 bg-white group cursor-pointer h-full flex flex-col">
        {imageUrl && (
          <div className="w-full h-48 overflow-hidden">
            <img 
              src={imageUrl} 
              alt={title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        )}
        <CardHeader className="p-6 pb-4">
          <div className="text-xs font-bold uppercase tracking-widest text-natural-muted mb-2">
            {date}
          </div>
          <CardTitle className="text-xl font-medium text-natural-primary line-clamp-2 group-hover:text-natural-primary/80 transition-colors">
            {title}
          </CardTitle>
          <CardDescription className="text-natural-muted mt-2 line-clamp-3 leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardFooter className="p-6 pt-0 mt-auto">
          <Button 
            variant="ghost" 
            className="p-0 h-auto font-medium text-natural-primary hover:bg-transparent hover:text-natural-primary/80"
            onClick={onReadMore}
          >
            Read more &rarr;
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
