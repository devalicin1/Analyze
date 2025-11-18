import { useRef } from 'react'
import {
  Bar,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts'

type BarChartProps<T extends Record<string, unknown>> = {
  data: T[]
  xKey: keyof T
  yKey: keyof T
  color?: string
  height?: number
  formatter?: (value: number) => string
  showGrid?: boolean
  gradient?: boolean
}

export function BarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  color = '#0F8BFD',
  height = 280,
  formatter,
  showGrid = true,
  gradient = true,
}: BarChartProps<T>) {
  const maxValue = Math.max(...data.map((item) => Number(item[yKey]) || 0))
  const gradientIdRef = useRef(
    `barGradient-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 9)}`
  )
  const gradientId = gradientIdRef.current

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              vertical={false}
              opacity={0.5}
            />
          )}
          <XAxis
            dataKey={xKey as string}
            axisLine={false}
            tickLine={false}
            tick={{
              fontSize: 11,
              fill: '#64748b',
              fontWeight: 500,
            }}
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{
              fontSize: 11,
              fill: '#64748b',
              fontWeight: 500,
            }}
            width={60}
          />
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
            formatter={(value: number) =>
              formatter ? formatter(value) : value.toLocaleString()
            }
            cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }}
          />
          <Bar
            dataKey={yKey as string}
            radius={[8, 8, 0, 0]}
            maxBarSize={50}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {data.map((entry, index) => {
              const value = Number(entry[yKey]) || 0
              const opacity = gradient ? 0.6 + (value / maxValue) * 0.4 : 1
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={gradient ? `url(#${gradientId})` : color}
                  opacity={opacity}
                  style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))',
                  }}
                />
              )
            })}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}


