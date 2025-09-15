'use client';

import { useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export default function AnimatedStats() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const stats = [
    { label: 'Calls Analyzed', value: 1000000, suffix: '+', prefix: '' },
    { label: 'Accuracy Rate', value: 99.9, suffix: '%', prefix: '' },
    { label: 'Processing Speed', value: 0.3, suffix: 's', prefix: '<' },
    { label: 'Active Users', value: 5000, suffix: '+', prefix: '' }
  ];

  const [animatedValues, setAnimatedValues] = useState(stats.map(() => 0));

  useEffect(() => {
    if (isInView) {
      stats.forEach((stat, index) => {
        const duration = 2000;
        const steps = 60;
        const increment = stat.value / steps;
        let current = 0;

        const timer = setInterval(() => {
          current += increment;
          if (current >= stat.value) {
            current = stat.value;
            clearInterval(timer);
          }

          setAnimatedValues(prev => {
            const newValues = [...prev];
            newValues[index] = current;
            return newValues;
          });
        }, duration / steps);
      });
    }
  }, [isInView]);

  const formatNumber = (num: number, decimals: number = 0) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'K';
    }
    return num.toFixed(decimals);
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-6"
    >
      {stats.map((stat, index) => (
        <div key={index} className="text-center">
          <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
            {stat.prefix}
            {stat.label === 'Accuracy Rate'
              ? animatedValues[index].toFixed(1)
              : stat.label === 'Processing Speed'
              ? animatedValues[index].toFixed(1)
              : formatNumber(animatedValues[index])}
            {stat.suffix}
          </div>
          <div className="text-gray-400 mt-1">{stat.label}</div>
        </div>
      ))}
    </motion.div>
  );
}