import { useState, useEffect, useRef } from 'react';
import antiScraping from '../../utils/antiScraping.js';

const ProtectedContent = ({ 
  children, 
  level = 'medium', // low, medium, high
  requireInteraction = false,
  obfuscate = true 
}) => {
  const [isVisible, setIsVisible] = useState(!requireInteraction);
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    // Check if user is verified human
    if (!antiScraping.isVerifiedHuman()) {
      setIsVisible(false);
      return;
    }

    // Add interaction tracking
    const trackInteraction = () => {
      setHasInteracted(true);
      if (requireInteraction) {
        setIsVisible(true);
      }
    };

    // Add various interaction listeners
    const events = ['mouseenter', 'click', 'focus'];
    const element = contentRef.current;
    
    if (element && requireInteraction) {
      events.forEach(event => {
        element.addEventListener(event, trackInteraction);
      });
    }

    return () => {
      if (element) {
        events.forEach(event => {
          element.removeEventListener(event, trackInteraction);
        });
      }
    };
  }, [requireInteraction]);

  // Dynamic content obfuscation
  useEffect(() => {
    if (!obfuscate || !contentRef.current) return;

    const element = contentRef.current;
    const textNodes = [];
    
    // Find all text nodes
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim()) {
        textNodes.push(node);
      }
    }

    // Obfuscate text content
    textNodes.forEach(textNode => {
      const originalText = textNode.textContent;
      
      if (!isDecrypted) {
        // Simple character shifting obfuscation
        const obfuscatedText = originalText
          .split('')
          .map(char => {
            if (char.match(/[a-zA-Z]/)) {
              const code = char.charCodeAt(0);
              const shifted = code + 1;
              return String.fromCharCode(shifted);
            }
            return char;
          })
          .join('');
        
        textNode.textContent = obfuscatedText;
        textNode.setAttribute('data-original', originalText);
      }
    });

    // Decrypt on interaction
    const handleDecrypt = () => {
      if (hasInteracted || !requireInteraction) {
        textNodes.forEach(textNode => {
          const original = textNode.getAttribute('data-original');
          if (original) {
            textNode.textContent = original;
          }
        });
        setIsDecrypted(true);
      }
    };

    if (hasInteracted || !requireInteraction) {
      handleDecrypt();
    }

    element.addEventListener('mouseenter', handleDecrypt);
    return () => element.removeEventListener('mouseenter', handleDecrypt);
  }, [hasInteracted, requireInteraction, obfuscate, isDecrypted]);

  // Add protection based on level
  const getProtectionStyles = () => {
    const baseStyles = {
      position: 'relative',
      userSelect: level === 'high' ? 'none' : 'auto',
      WebkitUserSelect: level === 'high' ? 'none' : 'auto',
      MozUserSelect: level === 'high' ? 'none' : 'auto',
      msUserSelect: level === 'high' ? 'none' : 'auto'
    };

    if (level === 'high') {
      return {
        ...baseStyles,
        pointerEvents: hasInteracted ? 'auto' : 'none',
        filter: hasInteracted ? 'none' : 'blur(2px)',
        transition: 'filter 0.3s ease'
      };
    }

    if (level === 'medium') {
      return {
        ...baseStyles,
        opacity: hasInteracted || !requireInteraction ? 1 : 0.7,
        transition: 'opacity 0.3s ease'
      };
    }

    return baseStyles;
  };

  // Add overlay for high protection
  const renderOverlay = () => {
    if (level !== 'high' || hasInteracted || !requireInteraction) return null;

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255, 255, 255, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          backdropFilter: 'blur(1px)'
        }}
        onClick={() => setHasInteracted(true)}
      >
        <div style={{
          background: '#007bff',
          color: 'white',
          padding: '0.5rem 1rem',
          borderRadius: '4px',
          fontSize: '0.875rem',
          fontWeight: '500'
        }}>
          Click to view content
        </div>
      </div>
    );
  };

  if (!isVisible) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#666',
        fontStyle: 'italic'
      }}>
        Content protected - verification required
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      style={getProtectionStyles()}
      data-protection-level={level}
      data-sensitive="true"
    >
      {renderOverlay()}
      {children}
    </div>
  );
};

// Higher-order component for protecting entire components
export const withContentProtection = (WrappedComponent, options = {}) => {
  return function ProtectedComponent(props) {
    return (
      <ProtectedContent {...options}>
        <WrappedComponent {...props} />
      </ProtectedContent>
    );
  };
};

// Hook for checking if content should be protected
export const useContentProtection = (level = 'medium') => {
  const [isProtected, setIsProtected] = useState(true);
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    const checkAccess = () => {
      const isVerified = antiScraping.isVerifiedHuman();
      setCanAccess(isVerified);
      
      if (level === 'low') {
        setIsProtected(!isVerified);
      } else if (level === 'medium') {
        setIsProtected(!isVerified);
      } else if (level === 'high') {
        setIsProtected(!isVerified);
      }
    };

    checkAccess();
    
    // Recheck periodically
    const interval = setInterval(checkAccess, 5000);
    return () => clearInterval(interval);
  }, [level]);

  return { isProtected, canAccess };
};

export default ProtectedContent;
