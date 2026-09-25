import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Ghost, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { log } from '../utils/logger.js';

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    log.debug('page:mount', { route: '404', attemptedPath: location.pathname });
  }, [location.pathname]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="inline-flex p-6 rounded-3xl bg-zinc-900 border border-zinc-800 mb-8"
        >
          <Ghost className="w-16 h-16 text-violet-400" />
        </motion.div>

        <h1 className="text-6xl font-bold text-zinc-100 mb-2">404</h1>
        <p className="text-xl text-zinc-400 mb-2">Page not found</p>
        <p className="text-zinc-600 mb-10 max-w-sm mx-auto">
          This page has gone cold. Even the best detectives can&apos;t find a trace of it.
        </p>

        <Button variant="primary" size="lg" as={Link} to="/">
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Button>
      </motion.div>
    </div>
  );
}
