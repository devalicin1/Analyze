import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type SeriesConfig = {
  dataKey: string
  label: string
  color: string
}

type LineChartProps<T extends Record<string, unknown>> = {
  data: T[]
  xKey: keyof T
  series: SeriesConfig[]
  height?: number
  formatter?: (value: number) => string
}

export function LineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 320,
  formatter,
}: LineChartProps<T>) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data}>
        <CartesianGrid stroke="#E5E7EB" strokeDasharray="4 4" />
        <XAxis
          dataKey={xKey as string}
          tick={{ fontSize: 12, fill: '#667085' }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 12, fill: '#667085' }} tickLine={false} />
        <Tooltip formatter={(value: number) => (formatter ? formatter(value) : value)} />
        <Legend />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.label}
            stroke={s.color}
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5 }}
          />
        ))}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
}


