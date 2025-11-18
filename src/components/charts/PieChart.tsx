import React from 'react'
import {
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  Cell,
  Legend,
} from 'recharts'

type PieChartProps<T extends Record<string, unknown>> = {
  data: T[]
  nameKey: keyof T
  valueKey: keyof T
  colors?: string[]
  height?: number
  formatter?: (value: number, name: string) => string | number
  showLegend?: boolean
  centerLabel?: string | React.ReactNode
  innerRadius?: number
  outerRadius?: number
}

const defaultColors = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#4b5563', // gray
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // yellow
  '#8b5cf6', // purple
]

export function PieChart<T extends Record<string, unknown>>({
  data,
  nameKey,
  valueKey,
  colors = defaultColors,
  height = 320,
  formatter,
  showLegend = false,
  centerLabel,
  innerRadius = 70,
  outerRadius = 110,
}: PieChartProps<T>) {
  const total = data.reduce(
    (sum, item) => sum + (Number(item[valueKey]) || 0),
    0
  )

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsPieChart>
          <defs>
            {data.map((_, index) => {
              const color = colors[index % colors.length]
              return (
                <linearGradient
                  key={`gradient-${index}`}
                  id={`gradient-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={1} />
                  <stop
                    offset="100%"
                    stopColor={color}
                    stopOpacity={0.7}
                  />
                </linearGradient>
              )
            })}
          </defs>
          <Pie
            data={data}
            dataKey={valueKey as string}
            nameKey={nameKey as string}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            strokeWidth={2}
            stroke="#ffffff"
            paddingAngle={2}
            animationBegin={0}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={`url(#gradient-${index})`}
                style={{
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                }}
              />
            ))}
          </Pie>
          {centerLabel && (
            <g>
              {typeof centerLabel === 'string' ? (
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-700"
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  {centerLabel}
                </text>
              ) : (
                centerLabel
              )}
            </g>
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 16px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              fontSize: '13px',
            }}
            labelStyle={{
              fontWeight: 600,
              marginBottom: '6px',
              color: '#1e293b',
              fontSize: '14px',
            }}
            itemStyle={{
              color: '#475569',
              padding: '2px 0',
            }}
            formatter={formatter}
            cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              wrapperStyle={{
                paddingTop: '20px',
                fontSize: '12px',
              }}
              formatter={(value) => (
                <span style={{ color: '#64748b' }}>{value}</span>
              )}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  )
}


