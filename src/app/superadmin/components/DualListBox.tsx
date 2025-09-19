'use client';

import { useState } from 'react';

interface DualListBoxProps {
  title: string;
  icon: string;
  leftTitle?: string;
  rightTitle?: string;
  availableItems: string[];
  selectedItems: string[];
  onItemsChange: (items: string[]) => void;
  height?: string;
}

export default function DualListBox({
  title,
  icon,
  leftTitle = 'Included',
  rightTitle = 'Not Included',
  availableItems,
  selectedItems,
  onItemsChange,
  height = '300px'
}: DualListBoxProps) {
  const [leftSelected, setLeftSelected] = useState<string[]>([]);
  const [rightSelected, setRightSelected] = useState<string[]>([]);
  const [searchLeft, setSearchLeft] = useState('');
  const [searchRight, setSearchRight] = useState('');

  // Items in left box (selected/included)
  const leftItems = selectedItems;
  // Items in right box (available/not included)
  const rightItems = availableItems.filter(item => !selectedItems.includes(item));

  // Filter items based on search
  const filteredLeftItems = leftItems.filter(item =>
    item.toLowerCase().includes(searchLeft.toLowerCase())
  );
  const filteredRightItems = rightItems.filter(item =>
    item.toLowerCase().includes(searchRight.toLowerCase())
  );

  // Move selected items from left to right (remove from included)
  const moveToRight = () => {
    const newSelected = selectedItems.filter(item => !leftSelected.includes(item));
    onItemsChange(newSelected);
    setLeftSelected([]);
  };

  // Move selected items from right to left (add to included)
  const moveToLeft = () => {
    const newSelected = [...selectedItems, ...rightSelected];
    onItemsChange(newSelected);
    setRightSelected([]);
  };

  // Move all items to right (clear all)
  const moveAllToRight = () => {
    onItemsChange([]);
    setLeftSelected([]);
  };

  // Move all items to left (select all)
  const moveAllToLeft = () => {
    onItemsChange(availableItems);
    setRightSelected([]);
  };

  const toggleLeftSelection = (item: string) => {
    setLeftSelected(prev =>
      prev.includes(item)
        ? prev.filter(i => i !== item)
        : [...prev, item]
    );
  };

  const toggleRightSelection = (item: string) => {
    setRightSelected(prev =>
      prev.includes(item)
        ? prev.filter(i => i !== item)
        : [...prev, item]
    );
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        fontSize: '14px',
        fontWeight: '600',
        color: '#374151',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span>{icon}</span> {title}
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: '12px',
        alignItems: 'stretch'
      }}>
        {/* Left List - Included */}
        <div style={{
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f9fafb',
            borderRadius: '8px 8px 0 0'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '4px'
            }}>
              {leftTitle} ({leftItems.length})
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchLeft}
              onChange={(e) => setSearchLeft(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: '#ffffff'
              }}
            />
          </div>
          <div style={{
            height,
            overflowY: 'auto',
            padding: '4px'
          }}>
            {filteredLeftItems.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '13px'
              }}>
                No items
              </div>
            ) : (
              filteredLeftItems.map(item => (
                <div
                  key={item}
                  onClick={() => toggleLeftSelection(item)}
                  style={{
                    padding: '6px 8px',
                    margin: '2px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    background: leftSelected.includes(item) ? '#dbeafe' : '#ffffff',
                    border: `1px solid ${leftSelected.includes(item) ? '#93c5fd' : 'transparent'}`,
                    transition: 'all 0.2s',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!leftSelected.includes(item)) {
                      e.currentTarget.style.background = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!leftSelected.includes(item)) {
                      e.currentTarget.style.background = '#ffffff';
                    }
                  }}
                >
                  {item}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Middle Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '8px',
          padding: '20px 0'
        }}>
          <button
            onClick={moveAllToLeft}
            title="Move all to included"
            style={{
              padding: '6px',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#6b7280'
            }}
          >
            ≪
          </button>
          <button
            onClick={moveToLeft}
            disabled={rightSelected.length === 0}
            title="Move selected to included"
            style={{
              padding: '6px',
              background: rightSelected.length === 0 ? '#f3f4f6' : '#3b82f6',
              border: 'none',
              borderRadius: '4px',
              cursor: rightSelected.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              color: rightSelected.length === 0 ? '#9ca3af' : '#ffffff'
            }}
          >
            ◀
          </button>
          <button
            onClick={moveToRight}
            disabled={leftSelected.length === 0}
            title="Move selected to not included"
            style={{
              padding: '6px',
              background: leftSelected.length === 0 ? '#f3f4f6' : '#3b82f6',
              border: 'none',
              borderRadius: '4px',
              cursor: leftSelected.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              color: leftSelected.length === 0 ? '#9ca3af' : '#ffffff'
            }}
          >
            ▶
          </button>
          <button
            onClick={moveAllToRight}
            title="Move all to not included"
            style={{
              padding: '6px',
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#6b7280'
            }}
          >
            ≫
          </button>
        </div>

        {/* Right List - Not Included */}
        <div style={{
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid #e5e7eb',
            background: '#f9fafb',
            borderRadius: '8px 8px 0 0'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '4px'
            }}>
              {rightTitle} ({rightItems.length})
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchRight}
              onChange={(e) => setSearchRight(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: '#ffffff'
              }}
            />
          </div>
          <div style={{
            height,
            overflowY: 'auto',
            padding: '4px'
          }}>
            {filteredRightItems.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '13px'
              }}>
                No items
              </div>
            ) : (
              filteredRightItems.map(item => (
                <div
                  key={item}
                  onClick={() => toggleRightSelection(item)}
                  style={{
                    padding: '6px 8px',
                    margin: '2px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    background: rightSelected.includes(item) ? '#dbeafe' : '#ffffff',
                    border: `1px solid ${rightSelected.includes(item) ? '#93c5fd' : 'transparent'}`,
                    transition: 'all 0.2s',
                    userSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!rightSelected.includes(item)) {
                      e.currentTarget.style.background = '#f3f4f6';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!rightSelected.includes(item)) {
                      e.currentTarget.style.background = '#ffffff';
                    }
                  }}
                >
                  {item}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}