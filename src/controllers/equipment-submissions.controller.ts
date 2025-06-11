import { Context } from 'hono'
import { EquipmentService } from '../services/equipment.service.js'
import { DiscordService } from '../services/discord.service.js'
import { createAuthService } from '../services/auth-wrapper.service.js'
import { EquipmentSubmitPage } from '../components/pages/EquipmentSubmitPage.jsx'
import { Modal } from '../components/ui/Modal.jsx'

export async function showEquipmentSubmitForm(c: Context) {
  try {
    const authService = createAuthService(c)
    const user = await authService.getUser(c)

    if (!user) {
      return c.redirect('/auth/login?redirect=/equipment/submit')
    }

    const baseUrl = new globalThis.URL(c.req.url).origin

    return c.html(EquipmentSubmitPage({ baseUrl, user })?.toString() || 'Error rendering page')
  } catch (error) {
    console.error('Error showing equipment submit form:', error)
    return c.html('Internal server error', 500)
  }
}

export async function submitEquipment(c: Context) {
  try {
    const authService = createAuthService(c)
    const user = await authService.getUser(c)

    if (!user) {
      return c.redirect('/auth/login?redirect=/equipment/submit')
    }

    const body = await c.req.parseBody()

    // Validate required fields
    if (!body.name || !body.manufacturer || !body.category) {
      const baseUrl = new globalThis.URL(c.req.url).origin
      return c.html(
        EquipmentSubmitPage({
          baseUrl,
          user,
          children: Modal({
            id: 'validation-error',
            type: 'error',
            title: 'Validation Error',
            message: 'Please fill in all required fields (name, manufacturer, and category).',
          }),
        })?.toString() || 'Error rendering page'
      )
    }

    // Parse specifications if provided
    let specifications = {}
    if (
      body.specifications &&
      typeof body.specifications === 'string' &&
      body.specifications.trim()
    ) {
      try {
        // For now, just store as a simple description
        specifications = { description: body.specifications.trim() }
      } catch {
        // If parsing fails, store as description
        specifications = { description: body.specifications.toString() }
      }
    }

    const equipmentData = {
      name: body.name.toString().trim(),
      manufacturer: body.manufacturer.toString().trim(),
      category: body.category.toString() as 'blade' | 'rubber' | 'ball',
      subcategory:
        body.subcategory && body.subcategory.toString().trim()
          ? (body.subcategory.toString() as 'inverted' | 'long_pips' | 'anti' | 'short_pips')
          : undefined,
      specifications,
    }

    // Validate category
    if (!['blade', 'rubber', 'ball'].includes(equipmentData.category)) {
      const baseUrl = new globalThis.URL(c.req.url).origin
      return c.html(
        EquipmentSubmitPage({
          baseUrl,
          user,
          children: Modal({
            id: 'invalid-category',
            type: 'error',
            title: 'Invalid Category',
            message: 'Please select a valid equipment category.',
          }),
        })?.toString() || 'Error rendering page'
      )
    }

    // Validate subcategory if provided
    if (
      equipmentData.subcategory &&
      !['inverted', 'long_pips', 'anti', 'short_pips'].includes(equipmentData.subcategory)
    ) {
      const baseUrl = new globalThis.URL(c.req.url).origin
      return c.html(
        EquipmentSubmitPage({
          baseUrl,
          user,
          children: Modal({
            id: 'invalid-subcategory',
            type: 'error',
            title: 'Invalid Subcategory',
            message: 'Please select a valid equipment subcategory.',
          }),
        })?.toString() || 'Error rendering page'
      )
    }

    const supabase = authService.createServerClient()
    const equipmentService = new EquipmentService(supabase)

    const submissionId = await equipmentService.submitEquipment(user.id, equipmentData)

    if (!submissionId) {
      const baseUrl = new globalThis.URL(c.req.url).origin
      return c.html(
        EquipmentSubmitPage({
          baseUrl,
          user,
          children: Modal({
            id: 'submission-failed',
            type: 'error',
            title: 'Submission Failed',
            message: 'Failed to submit equipment. Please try again.',
          }),
        })?.toString() || 'Error rendering page'
      )
    }

    // Send Discord notification for new equipment submission
    try {
      const env = c.env as any
      if (env?.DISCORD_WEBHOOK_URL) {
        const discordService = new DiscordService(supabase, env)
        await discordService.notifyNewEquipmentSubmission({
          id: submissionId,
          name: equipmentData.name,
          manufacturer: equipmentData.manufacturer,
          category: equipmentData.category,
          subcategory: equipmentData.subcategory,
          submitter_email: user.email || 'Anonymous',
        })
      }
    } catch (error) {
      console.error('Failed to send Discord notification for equipment submission:', error)
      // Don't fail the submission if Discord notification fails
    }

    const baseUrl = new globalThis.URL(c.req.url).origin
    return c.html(
      EquipmentSubmitPage({
        baseUrl,
        user,
        children: Modal({
          id: 'submission-success',
          type: 'success',
          title: 'Equipment Submitted!',
          message:
            "Your equipment submission has been received and will be reviewed by our moderation team. You'll receive a Discord notification once it's been processed.",
        }),
      })?.toString() || 'Error rendering page'
    )
  } catch (error) {
    console.error('Error submitting equipment:', error)
    return c.html('Internal server error', 500)
  }
}
