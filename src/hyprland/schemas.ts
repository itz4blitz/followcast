import { z } from 'zod'

const pair = z.tuple([z.number(), z.number()])

const clientSchema = z.object({
  address: z.string().min(1),
  mapped: z.boolean(),
  hidden: z.boolean(),
  at: pair,
  size: pair,
  monitor: z.number().int(),
  class: z.string(),
  title: z.string(),
})

export const clientsSchema = z.array(clientSchema)

const monitorSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  x: z.number(),
  y: z.number(),
  scale: z.number().positive(),
  focused: z.boolean(),
})

export const monitorsSchema = z.array(monitorSchema)

export const activeWindowSchema = z
  .object({
    address: z.string().min(1).optional(),
  })
  .passthrough()
