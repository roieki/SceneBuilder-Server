const { parse, introspectionQuery, graphqlSync } = require('graphql')
const pluralize = require('pluralize')
const gql = require('graphql-tag')

const ApolloBoost = require('apollo-boost')
const ApolloClient = ApolloBoost.default

// const upsertSemanticLayoutNodeQuery = (semanticLayoutNode) => {
//   return `
//     upsertSemanticLayoutNode(
//       where: (
//         id: ${semanticLayoutNode.id}
//       )
//     )
//   `
// }

const scene = {
  async hydrateScenes(parent, { uri }, ctx, info) {
    console.log('uri', uri)
    const client = new ApolloClient({
      uri
    })
    const query = parse(introspectionQuery, { noLocation: true })

    let introspecteion = await client.query({ query })
    let {
      types,
      queryType,
      mutationType,
      subscriptionType
    } = introspecteion.data.__schema
    let objectTypes = types.filter(t => t.kind === 'OBJECT')
    let queryObject = objectTypes.filter(x => x.name === 'Query')
    let queries = queryObject[0].fields.map(x => x.name)

    let pluralQueries = queries.filter(x => {
      return pluralize.isPlural(x)
    })

    let serviceExists = await ctx.db.exists.SourceService({ url: uri })
    console.log('serviceExists', serviceExists, ctx.db.query)
    let sourceService

    if (!serviceExists) {
      console.error(`service ${uri} does not exist`)
      return
    } else {
      sourceService = await ctx.db.query.sourceService(
        { where: { url: uri } },
        info
      )
    }

    let scenes = await Promise.all(
      pluralQueries.map(async typeName => {
        let queryTxt = `
        query {
          ${typeName}(first: 1000){
            id
          }
        }
      `

        let query = gql(queryTxt)
        let result = await client.query({ query })
        let singularName = pluralize.singular(typeName)
        let sceneName = typeName + '_aggregation'

        let scene
        let dataOverlays = []
        let semanticLayoutNodes = []
        let nodes = []

        if (result.data && result.data[typeName].length > 0) {
          nodes = result.data[typeName].map((node, key) => ({
            name: `${singularName}_${key}`,
            sourceQuery: `${singularName}({ where: { id: '${
              node.id
            }' }}){ id }`,
            sourceService: { connect: { id: sourceService.id } },
            sourceQueryName: `${singularName}`
          }))
        }

        semanticLayoutNodes = await Promise.all(
          nodes.map(async node => {
            let semanticLayoutNodeExists = await ctx.db.exists.SemanticLayoutNode(
              {
                name: node.name
              }
            )
            if (!semanticLayoutNodeExists) {
              return await ctx.db.mutation.createSemanticLayoutNode(
                {
                  data: node
                },
                info
              )
            } else {
              return await ctx.db.mutation.updateSemanticLayoutNode(
                {
                  where: {
                    name: node.name
                  },
                  data: node
                },
                info
              )
            }
          })
        )

        // console.log('semanticLayoutNodes', semanticLayoutNodes)

        let sceneExists = await ctx.db.exists.Scene({ name: sceneName })

        if (!sceneExists) {
          scene = await ctx.db.mutation.createScene(
            {
              data: { name: sceneName }
            },
            info
          )
        } else {
          scene = await ctx.db.query.scene({ where: { name: sceneName } }, info)
        }

        console.log(
          'NODES!!!',
          semanticLayoutNodes.map(node => ({ id: node.id }))
        )
        let sceneId = scene.id
        delete scene.id

        let updated = {
          ...scene
        }

        if (semanticLayoutNodes.length > 0) {
          updated.semanticLayoutNodes = {
            connect: semanticLayoutNodes.map(node => ({ id: node.id }))
          }
        }

        await ctx.db.mutation.updateScene({
          where: { id: sceneId },
          data: updated
        })

        return updated
      })
    )

    console.log('Scenes', scenes)

    return {
      id: '123'
    }

    // let scene = await ctx.db.query.scenes({where: {id: sceneId}}, info)

    // let sceneData = getSceneData()
    // return ctx.db.mutation.updateScene({
    //   where: {id: sceneId },
    //   data: sceneData
    // })
  }
  // async createDraft(parent, { title, text }, ctx, info) {
  //   const userId = getUserId(ctx)
  //   return ctx.db.mutation.createPost(
  //     {
  //       data: {
  //         title,
  //         text,
  //         isPublished: false,
  //         author: {
  //           connect: { id: userId },
  //         },
  //       },
  //     },
  //     info
  //   )
  // },

  // async publish(parent, { id }, ctx, info) {
  //   const userId = getUserId(ctx)
  //   const postExists = await ctx.db.exists.Post({
  //     id,
  //     author: { id: userId },
  //   })
  //   if (!postExists) {
  //     throw new Error(`Post not found or you're not the author`)
  //   }

  //   return ctx.db.mutation.updatePost(
  //     {
  //       where: { id },
  //       data: { isPublished: true },
  //     },
  //     info,
  //   )
  // },

  // async deletePost(parent, { id }, ctx, info) {
  //   const userId = getUserId(ctx)
  //   const postExists = await ctx.db.exists.Post({
  //     id,
  //     author: { id: userId },
  //   })
  //   if (!postExists) {
  //     throw new Error(`Post not found or you're not the author`)
  //   }

  //   return ctx.db.mutation.deletePost({ where: { id } })
  // },
}

module.exports = { scene }
