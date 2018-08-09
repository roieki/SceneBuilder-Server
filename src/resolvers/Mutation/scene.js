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

    // console.log('pluralQueries', pluralQueries)

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
        let name = typeName + '_aggregation'

        let scene
        let dataOverlays = []
        let semanticLayoutNodes = []
        let nodes = []

        if (result.data && result.data[typeName].length > 0) {
          nodes = result.data[typeName].map((node, key) => ({
            name: `${singularName}_${key}`,
            sourceQuery: `${singularName}(id: ${node.id}){ id }`,
            sourceService: uri,
            sourceQueryName: `${singularName}`
          }))

          console.log('nodes', nodes)
        }

        semanticLayoutNodes = await Promise.all(
          nodes.map(async node => {
            let semanticLayoutNodeExists = await ctx.db.exists.SemanticLayoutNode(
              {
                name: node.name
              }
            )
            let n
            if (!semanticLayoutNodeExists) {
              n = await ctx.db.mutation.createSemanticLayoutNode({
                data: node
              })
              return n.id
            } else {
              n = await ctx.db.mutation.updateSemanticLayoutNode({
                where: {
                  name: node.name
                },
                data: node
              })
            }

            console.log('NODE', n)
            return n.id
          })
        )

        let sceneExists = await ctx.db.exists.Scene({ name })

        if (!sceneExists) {
          scene = await ctx.db.mutation.createScene({ data: { name } })
        } else {
          scene = await ctx.db.query.Scene({ where: { name } })
        }

        let updated = {
          ...scene,
          name,
          semanticLayoutNodes
        }

        await ctx.db.mutation.updateScene({
          where: { id: scene.id },
          data: updated
        })

        return scene
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
