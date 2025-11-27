import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { PersonaDimensions, InterfaceLanguage, DICT } from '../types';

interface Props {
  dimensions: PersonaDimensions;
  color?: string;
  lang?: InterfaceLanguage;
}

const PersonaRadar: React.FC<Props> = ({ dimensions, color = "#8884d8", lang = 'en' }) => {
  const labels = DICT[lang];
  const data = [
    { subject: labels.dim_empathy, A: dimensions.empathy, fullMark: 100 },
    { subject: labels.dim_rationality, A: dimensions.rationality, fullMark: 100 },
    { subject: labels.dim_humor, A: dimensions.humor, fullMark: 100 },
    { subject: labels.dim_intimacy, A: dimensions.intimacy, fullMark: 100 },
    { subject: labels.dim_creativity, A: dimensions.creativity, fullMark: 100 },
  ];

  return (
    <div className="w-full h-64 bg-white/5 rounded-xl backdrop-blur-sm">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#e5e7eb" strokeOpacity={0.2} />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <Radar
            name="Persona"
            dataKey="A"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PersonaRadar;
